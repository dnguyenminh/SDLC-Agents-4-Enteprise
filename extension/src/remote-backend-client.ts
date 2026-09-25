/**
 * RemoteBackendClient — Connects to the remote backend over REST,
 * exposes a local MCP-compatible wrapper server for LLM consumption.
 *
 * Delegates HTTP serving to WrapperServer and file proxy to Base64ProxyService.
 */
import * as vscode from "vscode";
import { ServerStatus } from "./types";
import { AuthManager } from "./auth/AuthManager";
import { getVisibleLocalToolDefinitions } from "./backend-local-tools";
import { Base64ProxyService } from "./services/Base64ProxyService";
import { WrapperServer } from "./services/WrapperServer";
import { httpGetJson, httpPostJson } from "./utils/http-client-utils";
import { buildBackendAuthHeaders } from "./utils/backend-auth-headers";
import { PegaMcpTools } from "./mcp/PegaMcpTools";
import { registerPegaLocalTools } from "./mcp/pega-local-tools";
import { AtlassianCredentialService } from "./services/AtlassianCredentialService";
import { registerAtlassianLocalTools } from "./mcp/atlassian/index";
import { registerDevtoolsTools } from "./mcp/devtools-bridge";

/** Health check timeout in milliseconds */
const HEALTH_TIMEOUT_MS = 5000;

/**
 * Extract port number from a URL string.
 * Pure module-level function — no class dependency needed (SRP: Task 5).
 * @param url - Absolute URL to parse
 * @returns Port number, or null if URL is invalid
 */
export function extractPort(url: string): number | null {
  try {
    const p = new URL(url);
    return p.port ? parseInt(p.port, 10) : (p.protocol === "https:" ? 443 : 80);
  } catch (err) {
    console.debug(`[extractPort] Invalid URL (non-fatal): ${(err as Error).message}`);
    return null;
  }

}
export class RemoteBackendClient implements vscode.Disposable {
  private _status: ServerStatus = "stopped";
  private _port: number | null = null;
  private readonly _onStatusChange = new vscode.EventEmitter<ServerStatus>();
  readonly onStatusChange = this._onStatusChange.event;
  private readonly _onNotification = new vscode.EventEmitter<{ method: string; params?: any }>();
  public readonly onNotification = this._onNotification.event;
  private readonly base64Proxy = new Base64ProxyService();
  private wrapperServer: WrapperServer | null = null;

  constructor(
    private readonly workspaceFolder: string,
    private readonly outputChannel: vscode.OutputChannel,
    private readonly authManager: AuthManager | undefined,
    private backendUrl: string,
    secrets?: vscode.SecretStorage
  ) {
    this._port = extractPort(backendUrl);
    if (secrets) {
      try {
        registerPegaLocalTools(new PegaMcpTools(secrets));
      } catch (err) {
        console.warn(`[RemoteBackendClient] Pega tools registration failed: ${(err as Error).message}`);
      }
      try {
        registerAtlassianLocalTools(new AtlassianCredentialService(secrets));
      } catch (err) {
        console.warn(`[RemoteBackendClient] Atlassian tools registration failed: ${(err as Error).message}`);
      }
      // Register Chrome DevTools MCP tools (in-process, lazy browser init)
      registerDevtoolsTools().catch((err) => {
        console.warn(`[RemoteBackendClient] DevTools tools registration failed: ${(err as Error).message}`);
      });
    }
  }

  get status(): ServerStatus { return this._status; }
  get pid(): number | null { return null; }
  get port(): number | null { return this.wrapperServer?.listeningPort || this._port; }

  async connect(): Promise<void> {
    this.setStatus("starting");
    try {
      await this.checkHealth();
      await this.startWrapper();
      this.setStatus("running");
      this.outputChannel.appendLine(`[RemoteBackendClient] Connected to ${this.backendUrl} (REST mode)`);
    } catch (err: any) {
      this.setStatus("crashed");
      this.outputChannel.appendLine(`[RemoteBackendClient] Connection failed: ${err.message}`);
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    if (this.wrapperServer) { await this.wrapperServer.stop(); this.wrapperServer = null; }
    this.setStatus("stopped");
  }

  async invokeTool(name: string, args: Record<string, unknown>): Promise<string> {
    if (this._status !== "running") throw new Error("Backend not connected.");
    const result = await this.wrapperServer!.routeToolCall({ name, arguments: args });
    if (result.isError) throw new Error(`Tool failed: ${JSON.stringify(result.content)}`);
    return JSON.stringify(result);
  }

  async spawn(): Promise<void> { await this.connect(); }
  async kill(): Promise<void> { await this.disconnect(); }
  async restart(): Promise<void> { await this.disconnect(); await this.connect(); }
  async reconnect(): Promise<void> { await this.disconnect(); await this.connect(); }

  /**
   * Switch to a new backend URL and reconnect, without an extension reload
   * (SA4E-320). Updates the derived port and re-runs connect() so REST calls,
   * health probe, and the wrapper all target the new backend. No-op when the
   * URL is unchanged.
   * @param url New backend base URL (trailing slash already stripped by caller).
   */
  async updateBackendUrl(url: string): Promise<void> {
    if (url === this.backendUrl) { return; }
    this.backendUrl = url;
    this._port = extractPort(url);
    this.outputChannel.appendLine(`[RemoteBackendClient] Backend URL changed → ${url}. Reconnecting...`);
    await this.reconnect();
  }

  dispose(): void {
    this.disconnect().catch(() => {});
    this._onNotification.dispose();
    this._onStatusChange.dispose();
  }

  private async startWrapper(): Promise<void> {
    const port = vscode.workspace.getConfiguration("kiroSdlc").get<number>("mcpServerPort", 9181);
    this.wrapperServer = new WrapperServer({
      outputChannel: this.outputChannel,
      base64Proxy: this.base64Proxy,
      restGetTools: () => this.restGetTools(),
      restCallTool: (name, args) => this.restCallTool(name, args),
    });
    await this.wrapperServer.start(port);
  }

  private async restGetTools(): Promise<any[]> {
    try {
      const json = await httpGetJson<{ tools?: any[] }>(
        `${this.backendUrl}/api/tools`,
        { headers: this.buildAuthHeaders(), timeoutMs: 5000 }
      );
      const tools = json.tools || [];
      const existing = new Set(tools.map((t: any) => t.name));
      for (const def of getVisibleLocalToolDefinitions()) {
        if (!existing.has(def.name)) tools.push(def);
      }
      return tools;
    } catch (err) {
      console.debug(`[RemoteBackendClient] restGetTools failed, using local tools: ${(err as Error).message}`);
      return getVisibleLocalToolDefinitions();
    }
  }

  private async restCallTool(name: string, args: Record<string, unknown>): Promise<any> {
    const json = await httpPostJson<any>(
      `${this.backendUrl}/api/tools/execute`,
      { tool_name: name, arguments: args },
      { headers: this.buildAuthHeaders(), timeoutMs: 30000 }
    );
    if (json.error) {
      throw new Error(json.error.message || JSON.stringify(json.error));
    }
    return json.data || { content: [{ type: "text", text: JSON.stringify(json.data) }], isError: false };
  }

  private buildAuthHeaders(): Record<string, string> {
    return buildBackendAuthHeaders(this.authManager);
  }

  private async checkHealth(): Promise<void> {
    // Health probe — uses fetch() which is globally proxy-patched
    const response = await fetch(`${this.backendUrl}/health`, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    if (response.status !== 200) {
      throw new Error(`Health check failed: ${response.status}`);
    }
  }

  private setStatus(status: ServerStatus) {
    if (this._status !== status) { this._status = status; this._onStatusChange.fire(status); }
  }
}

