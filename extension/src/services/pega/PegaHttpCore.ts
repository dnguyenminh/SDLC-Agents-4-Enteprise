/**
 * PegaHttpCore — shared HTTP primitives + credential/endpoint resolution for
 * the Pega client family (SA4E-323 refactor: split out of the 1088-line
 * PegaHttpClient to honor the ≤200-LOC standard). Behavior-preserving.
 *
 * Holds the mutable `activePrefix` state and the auth/endpoint/retry helpers
 * that every Pega REST call shares. The rule/context/backend clients are free
 * functions that take a PegaHttpCore so this state stays single-owned.
 * All fetch() calls route through the global proxy patch (global-fetch-patch).
 */

import * as vscode from "vscode";
import { getWsHash, secretKey, LEGACY_SECRET } from "../WorkspaceScopeResolver";
import { assertWorkspaceTrusted } from "../WorkspaceTrustGuard";
import { enforcePegaEndpointHttps } from "../../config/pega-endpoint";

/** Pega operator + application context returned by getOperatorContext(). */
export interface PegaOperatorContext {
  operatorId: string;
  activeAccessGroup: string;
  currentApplication: { name: string; version: string; pzInsKey: string };
  rulesetStack: Array<{ name: string; version: string }>;
}

export class PegaHttpCore {
  /** REST prefix locked in after the first successful call (mutable shared state). */
  public activePrefix: string | null = null;

  constructor(
    public readonly secrets: vscode.SecretStorage,
    private readonly outputChannel?: vscode.OutputChannel
  ) {}

  /** Append a diagnostic line to the output channel (or console fallback). */
  log(msg: string): void {
    if (this.outputChannel) { this.outputChannel.appendLine(msg); }
    else { console.log(msg); }
  }

  /**
   * Build the HTTP Basic auth header. Credential choke-point (SA4E-323 SEC-01):
   * refuses to read credentials while the workspace is untrusted.
   */
  async getAuthHeader(): Promise<string> {
    assertWorkspaceTrusted();
    const config = vscode.workspace.getConfiguration("kiroSdlc");
    const username = config.get<string>("pegaUsername", "").trim();
    const password = await this.readWorkspacePassword();
    return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
  }

  /** Current-workspace Pega password; legacy flat key only when no folder. */
  private async readWorkspacePassword(): Promise<string> {
    try {
      const wsHash = getWsHash();
      const key = wsHash ? secretKey("pega", wsHash)! : LEGACY_SECRET.pega;
      return (await this.secrets.get(key)) || "";
    } catch { return ""; }
  }

  /** Configured Pega endpoint with SEC-02 HTTPS enforcement applied. */
  getPegaEndpoint(): string {
    const config = vscode.workspace.getConfiguration("kiroSdlc");
    const raw = config.get<string>("pegaEndpoint", "http://localhost:8080/prweb").replace(/\/$/, "");
    return enforcePegaEndpointHttps(raw);
  }

  /** SA4E-241 SEC-03: configured Pega operator id (no hardcoded default). */
  getConfiguredUsername(): string {
    return vscode.workspace.getConfiguration("kiroSdlc").get<string>("pegaUsername", "").trim();
  }

  /** Backend base URL (Code Intelligence server). */
  getBackendUrl(): string {
    return vscode.workspace.getConfiguration("kiroSdlc")
      .get<string>("backendUrl", "http://localhost:48721").replace(/\/$/, "");
  }

  /** Candidate REST prefixes, active prefix first once discovered. */
  getCustomRestPrefixes(): string[] {
    const base = this.getPegaEndpoint();
    const prefixes = [
      `${base}/api/CodeIntelligence/v1`,
      `${base}/PRRestService/CodeIntelligence/v1`,
      `${base}/api/v1`,
      `${base}/PRRestService/v1`,
    ];
    if (this.activePrefix) {
      return [this.activePrefix, ...prefixes.filter((p) => p !== this.activePrefix)];
    }
    return prefixes;
  }

  /** Sleep helper for backoff. */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** fetch() with exponential backoff on 502/503/504 and network errors. */
  async fetchWithRetry(url: string, init: RequestInit, maxRetries = 2): Promise<Response> {
    let attempt = 0;
    while (attempt <= maxRetries) {
      try {
        const res = await fetch(url, init);
        if ((res.status === 503 || res.status === 504 || res.status === 502) && attempt < maxRetries) {
          attempt++;
          await this.delay(this.backoffMs(attempt, res.headers.get("retry-after"), url, res.status));
          continue;
        }
        return res;
      } catch (err: any) {
        attempt++;
        if (attempt > maxRetries) { throw err; }
        this.log(`[PegaHttpClient] ⏳ Network Error: ${err.message}. Retrying (Attempt ${attempt}/${maxRetries})...`);
        await this.delay(Math.pow(2, attempt) * 1000 + Math.floor(Math.random() * 500));
      }
    }
    return fetch(url, init);
  }

  /** Compute backoff ms honoring Retry-After; logs the retry. */
  private backoffMs(attempt: number, retryAfter: string | null, url: string, status: number): number {
    let ms = Math.pow(2, attempt) * 1000 + Math.floor(Math.random() * 500);
    if (retryAfter && !isNaN(Number(retryAfter))) { ms = Number(retryAfter) * 1000; }
    this.log(`[PegaHttpClient] ⏳ HTTP ${status} on ${url}. Retrying in ${(ms / 1000).toFixed(1)}s (Attempt ${attempt})...`);
    return ms;
  }
}
