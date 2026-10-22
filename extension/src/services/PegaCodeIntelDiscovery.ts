/**
 * PegaCodeIntelDiscovery — SA4E-230
 * Drives the backend `/api/v1/pega/discover` route from the extension so the
 * "Index Source Code" command can surface a Pega app's service surface
 * (Access Groups -> Service Packages -> Service Methods -> linked Activities)
 * via the custom CodeIntelligence data-page API.
 *
 * Uses the existing PegaHttpClient (Basic auth + endpoint) so no new
 * credential handling is introduced.
 */

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { PegaHttpClient } from "./PegaHttpClient";
import { withAuthRetry, type IngestAuthProvider } from "../utils/backend-auth-headers";
import { getSetting } from "../config/settings-migration";

export interface DiscoveryProgress {
  report(v: { message: string }): void;
}

export interface PegaCodeIntelDiscoveryResult {
  // Backend returns either a numeric count or the raw array of items; the summary
  // coerces both to a count. Typed as a union so callers handle both shapes.
  servicePackages: number | unknown[];
  methods: number | unknown[];
  totalLinks: number | unknown[];
  accessGroups: string[];
}

export class PegaCodeIntelDiscovery {
  constructor(
    private readonly httpClient: PegaHttpClient,
    private readonly outputChannel?: vscode.OutputChannel,
    private readonly log?: (msg: string) => void,
    private readonly auth?: IngestAuthProvider,
  ) {}

  private trace(msg: string): void {
    if (this.outputChannel) this.outputChannel.appendLine(msg);
    else if (this.log) this.log(msg);
    else console.log(msg);
  }

  /**
   * Resolve application name/version for discovery.
   * Priority: pega-project.json -> sdlcAgents config. Fails loud (SA4E-349)
   * when neither source resolves — never falls back to a hardcoded app.
   */
  private resolveAppInfo(root: string): { appName: string; appVersion: string } {
    const candidates = [
      path.join(root, "pega-project.json"),
      path.join(root, ".kiro", "pega-project.json"),
    ];
    for (const p of candidates) {
      try {
        if (!fs.existsSync(p)) { continue; }
        const json = JSON.parse(fs.readFileSync(p, "utf-8")) as Record<string, string>;
        const appName = json.appName || json.applicationName;
        const appVersion = json.version || json.appVersion || json.applicationVersion;
        if (appName && appVersion) { return { appName, appVersion }; }
      } catch { /* ignore malformed */ }
    }
    // SA4E-370: renamed keys sdlcAgents.pega.appName / sdlcAgents.pega.appVersion
    // (declared in package.json); legacy undocumented flat keys stay readable.
    const appName = getSetting<string>("pega.appName", "pegaAppName", "").trim();
    const appVersion = getSetting<string>("pega.appVersion", "pegaAppVersion", "").trim();
    if (appName && appVersion) { return { appName, appVersion }; }
    throw new Error(
      "Cannot resolve Pega application for discovery: no valid appName/appVersion in " +
      "pega-project.json or sdlcAgents.pega.appName/pega.appVersion. Run 'Fetch Pega Context' first."
    );
  }

  /**
   * Headers for /api/v1/pega/discover: Bearer token from the live auth provider
   * plus the caller's project id (never a copy captured at startup).
   */
  private authHeaders(projectId: string): Record<string, string> {
    const token = (globalThis as { __authTokenProvider?: () => string }).__authTokenProvider?.() || "";
    const headers: Record<string, string> = { "X-Project-Id": projectId };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return headers;
  }

  private async callBackendDiscovery(payload: Record<string, unknown>, projectId: string): Promise<PegaCodeIntelDiscoveryResult> {
    const backendUrl = this.httpClient.getBackendUrlPublic().replace(/\/$/, "");
    const url = `${backendUrl}/api/v1/pega/discover`;
    // SA4E-362 FR-7 (T-2): wrap the fetch in the shared refresh-on-401 helper —
    // 401 → refresh exactly once → retry exactly once. The 120s AbortSignal is
    // PER-ATTEMPT (inside the send closure), worst-case total 240s — accepted (FSD T-2).
    const res = await withAuthRetry(async (token) => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        // /api/v1/* sits behind jwtAuthStrict — without a Bearer token this 401s
        // with AUTH_REQUIRED, which the caller surfaces as a discovery failure.
        ...this.authHeaders(projectId),
      };
      if (token) { headers["Authorization"] = `Bearer ${token}`; } // fresh token on retry
      return fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(120000),
      });
    }, this.auth, (msg) => this.trace(msg), "discover");
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`backend ${res.status}: ${text.substring(0, 200)}`);
    }
    const json = (await res.json()) as { data?: PegaCodeIntelDiscoveryResult; error?: { message?: string } };
    if (json.error?.message) throw new Error(json.error.message);
    if (!json.data) throw new Error("empty discovery result from backend");
    return json.data;
  }

  /** Run discovery and return a human-readable summary line. */
  public async run(opts: {
    root: string;
    report: DiscoveryProgress;
    projectId: string;
  }): Promise<string> {
    const { root, report, projectId } = opts;
    const endpoint = this.httpClient.getPegaEndpoint();
    const codeIntelBase = `${endpoint.replace(/\/$/, "")}/api/CodeIntelligence/v1`;
    const authHeader = await this.httpClient.getAuthHeader();
    const { appName, appVersion } = this.resolveAppInfo(root);

    this.trace(`[PegaDiscovery] → ${codeIntelBase} app=${appName}:${appVersion}`);
    report.report({ message: `Discovering Pega service surface (${appName}:${appVersion})...` });

    const data = await this.callBackendDiscovery({
      projectId,
      appName,
      appVersion,
      codeIntelBase,
      authHeader,
      index: true,
    }, projectId);

    // Backend may return counts as numbers or arrays; coerce to a count so the
    // summary never renders "[object Object]" (arrays stringify to their elements).
    const count = (v: unknown): number => (Array.isArray(v) ? v.length : Number(v) || 0);
    const summary =
      `✅ Pega CodeIntelligence discovery: ${count(data.servicePackages)} service package(s), ` +
      `${count(data.methods)} method(s), ${count(data.totalLinks)} linked rule(s) indexed.`;
    this.trace(`[PegaDiscovery] ${summary}`);
    report.report({ message: summary });
    return summary;
  }
}
