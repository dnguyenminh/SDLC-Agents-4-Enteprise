/**
 * RemoteBackendClient — Connects to the remote backend over REST,
 * exposes a local MCP-compatible wrapper server for LLM consumption.
 *
 * Delegates HTTP serving to WrapperServer and file proxy to Base64ProxyService.
 */
import * as vscode from "vscode";
import { ServerStatus } from "./types";
import { AuthManager } from "./auth/AuthManager";
import { getLocalToolDefinitions } from "./backend-local-tools";
import { Base64ProxyService } from "./services/Base64ProxyService";
import { WrapperServer } from "./services/WrapperServer";
import { httpGetJson, httpPostJson } from "./utils/http-client-utils";
import { buildBackendAuthHeaders } from "./utils/backend-auth-headers";

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
    private readonly backendUrl: string
  ) { this._port = extractPort(backendUrl); }

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
      for (const def of getLocalToolDefinitions()) {
        if (!existing.has(def.name)) tools.push(def);
      }
      return tools;
    } catch (err) {
      console.debug(`[RemoteBackendClient] restGetTools failed, using local tools: ${(err as Error).message}`);
      return getLocalToolDefinitions();
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
    // health probe — intentional: any error = service unavailable
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod: typeof import("http") = this.backendUrl.startsWith("https") ? require("https") : require("http");
    return new Promise((resolve, reject) => {
      const req = mod.get(`${this.backendUrl}/health`, (res) => {
        res.resume();
        if (res.statusCode === 200) { resolve(); }
        else { reject(new Error(`Health check failed: ${res.statusCode}`)); }
      });
      req.on("error", reject);
      req.setTimeout(HEALTH_TIMEOUT_MS, () => { req.destroy(); reject(new Error("Health check timed out")); });
    });
  }

  private setStatus(status: ServerStatus) {
    if (this._status !== status) { this._status = status; this._onStatusChange.fire(status); }
  }
}

