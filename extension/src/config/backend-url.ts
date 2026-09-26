/**
 * Resolve backend URL from VS Code settings.
 * Default value provided by package.json contributes.configuration.
 * No hardcoded fallback — single source of truth is package.json default.
 * Enforces HTTPS for non-loopback URLs (SEC-289-03), with an explicit
 * opt-in bypass via kiroSdlc.backend.allowInsecureRemote (SA4E-320).
 */
import * as vscode from "vscode";

/** Compile-time fallback — matches package.json configuration default. */
export const DEFAULT_BACKEND_URL = "http://127.0.0.1:48721";

/** Options for validateBackendUrl (backward-compatible optional param). */
export interface ValidateBackendUrlOptions {
  /** When true, HTTP remote (non-loopback) URLs are accepted with a warning. */
  allowInsecureRemote?: boolean;
}

import { isIP } from "node:net";

/**
 * True only for genuine loopback hosts. A bare "127." prefix is insufficient —
 * "127.attacker.com" is a DNS name, not an IP — so IPv4 hosts are matched only
 * after isIP() confirms them as real IPv4 addresses (SA4E-320 Finding #4).
 */
export function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host === "::1" || host === "[::1]") return true;
  if (isIP(host) === 4) return host.startsWith("127.");
  return false;
}

/**
 * Enforce HTTPS for remote (non-loopback) http: URLs.
 * Bypass ON → accept but still log a console.warn security warning.
 */
function enforceHttpsForRemote(parsed: URL, allowInsecureRemote: boolean): void {
  if (isLoopbackHost(parsed.hostname)) {
    return;
  }
  if (allowInsecureRemote) {
    // SA4E-320 Finding #7: wording must match the UI warning — explicit
    // credential-interception/MITM risk, not just "unencrypted HTTP".
    console.warn(
      `[Security] WARNING: Insecure remote backend URL allowed (allowInsecureRemote=true) — traffic to "${parsed.hostname}" is unencrypted HTTP. ` +
      `Credentials and data can be intercepted (MITM). Only use on trusted private networks.`
    );
    return;
  }
  const msg = `[Security] Insecure backend URL rejected: HTTP is only allowed for loopback addresses (localhost, 127.0.0.1). Use HTTPS for remote host "${parsed.hostname}".`;
  console.warn(msg);
  throw new Error(msg);
}

/** Reject any protocol other than http:/https: (applies with bypass ON or OFF). */
function rejectUnsupportedProtocol(protocol: string): void {
  if (protocol === "http:" || protocol === "https:") {
    return;
  }
  const msg = `[Security] Invalid backend URL protocol "${protocol}". Only HTTP (loopback) and HTTPS are allowed.`;
  console.warn(msg);
  throw new Error(msg);
}

/**
 * Validates backend URLs.
 * - Loopback URLs (localhost, 127.0.0.1) are permitted over HTTP for local development.
 * - Remote (non-loopback) HTTP is rejected unless options.allowInsecureRemote is true,
 *   in which case it is accepted but a console.warn security warning is still logged.
 * - Invalid protocols and malformed URLs are always rejected.
 */
export function validateBackendUrl(
  url: string,
  options: ValidateBackendUrlOptions = {}
): string {
  if (!url || typeof url !== "string") {
    return DEFAULT_BACKEND_URL;
  }
  const cleanUrl = url.replace(/\/$/, "");
  try {
    const parsed = new URL(cleanUrl);
    if (parsed.protocol === "http:") {
      enforceHttpsForRemote(parsed, options.allowInsecureRemote === true);
    }
    rejectUnsupportedProtocol(parsed.protocol);
    return cleanUrl;
  } catch (err: any) {
    if (err.message && err.message.startsWith("[Security]")) {
      throw err;
    }
    const msg = `[Security] Malformed backend URL: "${url}"`;
    console.warn(msg);
    throw new Error(msg);
  }
}

/**
 * Read the opt-in bypass flag (kiroSdlc.backend.allowInsecureRemote) fresh
 * from VS Code configuration. Strict `=== true` — missing/non-boolean → false
 * (fail-closed, enforcement stays ON).
 *
 * Single config-reading path shared by getBackendUrl(), KnowledgeClient URL
 * validation, and Settings panel handlers (SA4E-320 Finding #1 — one source
 * of truth so the bypass flows consistently to every consumer).
 */
export function getAllowInsecureRemote(): boolean {
  const config = vscode.workspace?.getConfiguration?.("kiroSdlc");
  return config?.get?.<boolean>("backend.allowInsecureRemote") === true;
}

/**
 * Get configured backend URL from kiroSdlc.backend.url setting.
 * Reads kiroSdlc.backend.allowInsecureRemote and passes it to validateBackendUrl.
 * Uses VS Code setting default defined in package.json.
 * @returns Backend URL string with trailing slash stripped (never empty)
 */
export function getBackendUrl(): string {
  const config = vscode.workspace?.getConfiguration?.("kiroSdlc");
  const url = config?.get?.<string>("backend.url");
  if (!url) {
    return DEFAULT_BACKEND_URL;
  }
  return validateBackendUrl(url, { allowInsecureRemote: getAllowInsecureRemote() });
}
