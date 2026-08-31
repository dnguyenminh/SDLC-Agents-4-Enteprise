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

export interface DiscoveryProgress {
  report(v: { message: string }): void;
}

export interface PegaCodeIntelDiscoveryResult {
  servicePackages: number;
  methods: number;
  totalLinks: number;
  accessGroups: string[];
}

export class PegaCodeIntelDiscovery {
  constructor(
    private readonly httpClient: PegaHttpClient,
    private readonly outputChannel?: vscode.OutputChannel,
    private readonly log?: (msg: string) => void,
  ) {}

  private trace(msg: string): void {
    if (this.outputChannel) this.outputChannel.appendLine(msg);
    else if (this.log) this.log(msg);
    else console.log(msg);
  }

  /**
   * Resolve application name/version for discovery.
   * Priority: pega-project.json -> kiroSdlc config -> sane defaults.
   */
  private resolveAppInfo(root: string): { appName: string; appVersion: string } {
    const candidates = [
      path.join(root, "pega-project.json"),
      path.join(root, ".kiro", "pega-project.json"),
    ];
    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) {
          const json = JSON.parse(fs.readFileSync(p, "utf-8")) as {
            appName?: string; version?: string; appVersion?: string;
          };
          const appName = json.appName || (json as any).applicationName;
          const appVersion = json.version || json.appVersion;
          if (appName && appVersion) return { appName, appVersion };
        }
      } catch { /* ignore malformed */ }
    }
    const config = vscode.workspace.getConfiguration("kiroSdlc");
    const appName = config.get<string>("pegaAppName", "").trim();
    const appVersion = config.get<string>("pegaAppVersion", "").trim();
    if (appName && appVersion) return { appName, appVersion };
    return { appName: "HRAppsV2", appVersion: "01.01" };
  }

  private async callBackendDiscovery(payload: Record<string, unknown>): Promise<PegaCodeIntelDiscoveryResult> {
    const backendUrl = this.httpClient.getBackendUrlPublic().replace(/\/$/, "");
    const url = `${backendUrl}/api/v1/pega/discover`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120000),
    });
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
    });

    const summary =
      `✅ Pega CodeIntelligence discovery: ${data.servicePackages} service package(s), ` +
      `${data.methods} method(s), ${data.totalLinks} linked rule(s) indexed.`;
    this.trace(`[PegaDiscovery] ${summary}`);
    report.report({ message: summary });
    return summary;
  }
}
