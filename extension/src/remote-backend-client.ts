/**
 * RemoteBackendClient — Connects to the remote backend over REST,
 * exposes a local MCP-compatible wrapper server for LLM consumption.
 *
 * Delegates HTTP serving to WrapperServer and file proxy to Base64ProxyService.
 */
import * as vscode from "vscode";
import { ServerStatus } from "./types";
import { AuthManager } from "./auth/AuthManager";
import * as http from "http";
import * as https from "https";
import { getLocalToolDefinitions } from "./backend-local-tools";
import { Base64ProxyService } from "./services/Base64ProxyService";
import { WrapperServer } from "./services/WrapperServer";
import { getProjectId } from "./extension";

/** Health check timeout in milliseconds */
const HEALTH_TIMEOUT_MS = 5000;

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
  ) { this._port = this.extractPort(backendUrl); }

  get status(): ServerStatus { return this._status; }
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

  // --- Lifecycle shortcuts ---
  async spawn(): Promise<void> { await this.connect(); }
  async kill(): Promise<void> { await this.disconnect(); }
  async restart(): Promise<void> { await this.disconnect(); await this.connect(); }
  async reconnect(): Promise<void> { await this.disconnect(); await this.connect(); }

  dispose(): void {
    this.disconnect().catch(() => {});
    this._onNotification.dispose();
    this._onStatusChange.dispose();
  }

  // --- Private ---

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

  private restGetTools(): Promise<any[]> {
    return new Promise((resolve) => {
      const url = new URL(`${this.backendUrl}/api/tools`);
      const opts = {
        hostname: url.hostname, port: url.port, path: url.pathname,
        method: "GET", headers: this.buildAuthHeaders(),
      };
      const r = http.request(opts, (resp) => {
        let data = "";
        resp.on("data", (c) => { data += c; });
        resp.on("end", () => {
          try {
            const json = JSON.parse(data);
            const tools = json.tools || [];
            const existing = new Set(tools.map((t: any) => t.name));
            for (const def of getLocalToolDefinitions()) {
              if (!existing.has(def.name)) tools.push(def);
            }
            resolve(tools);
          } catch { resolve(getLocalToolDefinitions()); }
        });
      });
      r.on("error", () => resolve(getLocalToolDefinitions()));
      r.setTimeout(5000, () => { r.destroy(); resolve(getLocalToolDefinitions()); });
      r.end();
    });
  }

  private restCallTool(name: string, args: Record<string, unknown>): Promise<any> {
    return new Promise((resolve, reject) => {
      const url = new URL(`${this.backendUrl}/api/tools/execute`);
      const payload = JSON.stringify({ tool_name: name, arguments: args });
      const opts = {
        hostname: url.hostname, port: url.port, path: url.pathname,
        method: "POST",
        headers: {
          ...this.buildAuthHeaders(),
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload).toString(),
        },
      };
      const r = http.request(opts, (resp) => {
        let data = "";
        resp.on("data", (c) => { data += c; });
        resp.on("end", () => {
          try {
            const json = JSON.parse(data);
            if (json.error) { reject(new Error(json.error.message || JSON.stringify(json.error))); return; }
            resolve(json.data || { content: [{ type: "text", text: JSON.stringify(json.data) }], isError: false });
          } catch (e) { reject(new Error(`Parse error: ${data.substring(0, 200)}`)); }
        });
      });
      r.on("error", (e) => reject(e));
      r.setTimeout(30000, () => { r.destroy(); reject(new Error("Timeout")); });
      r.write(payload);
      r.end();
    });
  }

  private buildAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    const token = this.authManager?.getTokenSync();
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const projectId = getProjectId();
    if (projectId && projectId !== "default") headers["X-Project-Id"] = projectId;
    return headers;
  }

  private async checkHealth(): Promise<void> {
    return new Promise((resolve, reject) => {
      const mod = this.backendUrl.startsWith("https") ? https : http;
      const req = mod.get(`${this.backendUrl}/health`, (res) => {
        if (res.statusCode === 200) resolve();
        else reject(new Error(`Health check failed: ${res.statusCode}`));
      });
      req.on("error", reject);
      req.setTimeout(HEALTH_TIMEOUT_MS, () => { req.destroy(); reject(new Error("Health check timed out")); });
    });
  }

  private extractPort(url: string): number | null {
    try {
      const p = new URL(url);
      return p.port ? parseInt(p.port, 10) : (p.protocol === "https:" ? 443 : 80);
    } catch (err) {
      this.outputChannel.appendLine(`[RemoteBackendClient] Invalid URL: ${(err as Error).message}`);
      return null;
    }
  }

  private setStatus(status: ServerStatus) {
    if (this._status !== status) { this._status = status; this._onStatusChange.fire(status); }
  }
}
