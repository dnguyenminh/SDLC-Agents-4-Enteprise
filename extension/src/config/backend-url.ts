/**
 * Resolve backend URL from VS Code settings.
 * Default value provided by package.json contributes.configuration.
 * No hardcoded fallback — single source of truth is package.json default.
 * Enforces HTTPS for non-loopback URLs (SEC-289-03).
 */
import * as vscode from "vscode";

/** Compile-time fallback — matches package.json configuration default. */
const DEFAULT_BACKEND_URL = "http://127.0.0.1:48721";

export function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    hostname.startsWith("127.")
  );
}

/**
 * Validates that remote (non-loopback) backend URLs use HTTPS.
 * Loopback URLs (localhost, 127.0.0.1) are permitted over HTTP for local development.
 */
export function validateBackendUrl(url: string): string {
  if (!url || typeof url !== "string") {
    return DEFAULT_BACKEND_URL;
  }
  const cleanUrl = url.replace(/\/$/, "");
  try {
    const parsed = new URL(cleanUrl);
    if (parsed.protocol === "http:" && !isLoopbackHost(parsed.hostname)) {
      const msg = `[Security] Insecure backend URL rejected: HTTP is only allowed for loopback addresses (localhost, 127.0.0.1). Use HTTPS for remote host "${parsed.hostname}".`;
      console.warn(msg);
      throw new Error(msg);
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      const msg = `[Security] Invalid backend URL protocol "${parsed.protocol}". Only HTTP (loopback) and HTTPS are allowed.`;
      console.warn(msg);
      throw new Error(msg);
    }
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
 * Get configured backend URL from kiroSdlc.backend.url setting.
 * Uses VS Code setting default defined in package.json.
 * @returns Backend URL string with trailing slash stripped (never empty)
 */
export function getBackendUrl(): string {
  const config = vscode.workspace?.getConfiguration?.("kiroSdlc");
  const url = config?.get?.<string>("backend.url");
  if (!url) {
    return DEFAULT_BACKEND_URL;
  }
  return validateBackendUrl(url);
}
