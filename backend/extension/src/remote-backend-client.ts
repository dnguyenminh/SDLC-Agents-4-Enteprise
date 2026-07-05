import * as vscode from "vscode";
import * as fs from "fs";
import { ServerStatus } from "./types";
import { AuthManager } from "./auth/AuthManager";
import * as http from "http";
import * as https from "https";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { z } from "zod";
import { executeLocalTool, wrapToolArguments } from "./backend-local-tools";

/** Tools that execute locally without forwarding to backend */
const LOCAL_TOOLS = new Set(["stream_write_file", "embed_image"]);

/** Maximum body size accepted by wrapper server (1MB) */
const MAX_BODY_SIZE = 1024 * 1024;

/** Health check timeout in milliseconds */
const HEALTH_TIMEOUT_MS = 5000;

export class RemoteBackendClient implements vscode.Disposable {
  private _status: ServerStatus = "stopped";
  private _port: number | null = null;
  private _wrapperPort: number | null = null;
  private readonly _onStatusChange = new vscode.EventEmitter<ServerStatus>();
  readonly onStatusChange = this._onStatusChange.event;
  private mcpClient: Client | null = null;
  private httpServer: http.Server | null = null;
  private requestId = 0;
  private readonly _onNotification = new vscode.EventEmitter<{ method: string; params?: any }>();
  public readonly onNotification = this._onNotification.event;

  constructor(
    private readonly workspaceFolder: string,
    private readonly outputChannel: vscode.OutputChannel,
    private readonly authManager: AuthManager | undefined,
    private readonly backendUrl: string
  ) { this._port = this.extractPort(backendUrl); }

  get status(): ServerStatus { return this._status; }
  get port(): number | null { return this._wrapperPort || this._port; }

  private extractPort(url: string): number | null {
    try { const p = new URL(url); return p.port ? parseInt(p.port, 10) : (p.protocol === "https:" ? 443 : 80); }
    catch (err) { this.outputChannel.appendLine(`[RemoteBackendClient] Invalid backend URL: ${(err as Error).message}`); return null; }
  }

  private setStatus(status: ServerStatus) {
    if (this._status !== status) { this._status = status; this._onStatusChange.fire(status); }
  }

  async connect(): Promise<void> {
    this.setStatus("starting");
    try {
      await this.checkHealth();
      this.mcpClient = new Client({ name: "kiro-sdlc-extension", version: "2.0.0" }, { capabilities: {} });
      this.mcpClient.fallbackNotificationHandler = async (n) => { this._onNotification.fire({ method: n.method, params: n.params }); };
      const url = new URL(`${this.backendUrl}/mcp`);
      const token = this.authManager?.getTokenSync();
      const requestInit: Record<string, any> = {};
      if (token) { requestInit.headers = { "Authorization": `Bearer ${token}` }; }
      const transport = new StreamableHTTPClientTransport(url, { requestInit });
      await this.mcpClient.connect(transport);
      await this.startLocalServer();
      this.setStatus("running");
      this.outputChannel.appendLine(`[RemoteBackendClient] Connected to ${this.backendUrl}`);
    } catch (err: any) {
      this.setStatus("crashed");
      this.outputChannel.appendLine(`[RemoteBackendClient] Connection failed: ${err.message}`);
      throw err;
    }
  }

  private async startLocalServer(): Promise<void> {
    const port = vscode.workspace.getConfiguration("kiroSdlc").get<number>("mcpServerPort", 9181);
    return new Promise((resolve, reject) => {
      const server = http.createServer(async (req, res) => {
        const u = new URL(req.url || "/", "http://localhost");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
        try {
          if (u.pathname === "/mcp") { await this.handleMcpRequest(req, res); return; }
          if (u.pathname === "/health") { res.writeHead(200, { "Content-Type": "application/json" }); res.end('{"status":"ok","mode":"wrapper"}'); return; }
          res.writeHead(404); res.end('{"error":"Not found"}');
        } catch (err: unknown) {
          if (!res.headersSent) { res.writeHead(500); res.end(JSON.stringify({ error: (err as Error).message })); }
        }
      });
      server.on("error", (err) => {
        this.outputChannel.appendLine(`[WrapperServer] Error: ${err.message}`);
        if (!this.httpServer) { reject(err); }
      });
      server.listen(port, "127.0.0.1", () => {
        this._wrapperPort = (server.address() as import("net").AddressInfo).port;
        this.httpServer = server;
        this.outputChannel.appendLine(`[WrapperServer] Listening on port ${this._wrapperPort}`);
        resolve();
      });
    });
  }

  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      req.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_BODY_SIZE) {
          req.destroy();
          reject(new Error(`Request body exceeds maximum size (${MAX_BODY_SIZE} bytes)`));
          return;
        }
        chunks.push(chunk);
      });
      req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
      req.on("error", reject);
    });
  }

  private async handleMcpRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (req.method !== "POST") { res.writeHead(405); res.end('{"error":"Method not allowed"}'); return; }
    const contentType = req.headers["content-type"] || "";
    if (!contentType.includes("application/json")) { res.writeHead(415); res.end('{"jsonrpc":"2.0","id":null,"error":{"code":-32700,"message":"Unsupported Content-Type, expected application/json"}}'); return; }
    const body = await this.readBody(req);
    let jsonRpc: any;
    try { jsonRpc = JSON.parse(body); } catch (err) { this.outputChannel.appendLine(`[WrapperServer] JSON parse error: ${(err as Error).message}`); res.writeHead(400); res.end('{"jsonrpc":"2.0","id":null,"error":{"code":-32700,"message":"Parse error"}}'); return; }
    if (jsonRpc.id === undefined) jsonRpc.id = ++this.requestId;
    if (!this.mcpClient) { res.writeHead(503); res.end(JSON.stringify({ jsonrpc: "2.0", id: jsonRpc.id, error: { code: -32002, message: "Backend not connected" } })); return; }
    try {
      if (jsonRpc.method === "tools/call" && jsonRpc.params) {
        const name = jsonRpc.params.name as string;
        const args = (jsonRpc.params.arguments || {}) as Record<string, unknown>;
        if (LOCAL_TOOLS.has(name)) {
          const result = await executeLocalTool(name, args);
          res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ jsonrpc: "2.0", id: jsonRpc.id, result })); return;
        }
        jsonRpc.params.arguments = wrapToolArguments(name, args);
      }
      const response = await this.mcpClient.request({ method: jsonRpc.method, params: jsonRpc.params }, z.any());
      res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ jsonrpc: "2.0", id: jsonRpc.id, result: response }));
    } catch (err: any) {
      res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ jsonrpc: "2.0", id: jsonRpc.id, error: { code: err.code || -32603, message: err.message } }));
    }
  }

  async disconnect(): Promise<void> {
    if (this.httpServer) {
      await new Promise<void>((resolve) => this.httpServer!.close(() => resolve()));
      this.httpServer = null;
    }
    if (this.mcpClient) { await this.mcpClient.close(); this.mcpClient = null; }
    this.setStatus("stopped");
  }

  async spawn(): Promise<void> { await this.connect(); }
  async kill(): Promise<void> { await this.disconnect(); }
  async restart(): Promise<void> { await this.disconnect(); await this.connect(); }
  async reconnect(): Promise<void> { await this.disconnect(); await this.connect(); }

  private async checkHealth(): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = (this.backendUrl.startsWith("https") ? https : http).get(`${this.backendUrl}/health`, (res) => {
        if (res.statusCode === 200) { resolve(); } else { reject(new Error(`Health check failed: ${res.statusCode}`)); }
      });
      req.on("error", reject);
      req.setTimeout(HEALTH_TIMEOUT_MS, () => { req.destroy(); reject(new Error("Health check timed out")); });
    });
  }

  async invokeTool(name: string, args: Record<string, unknown>): Promise<string> {
    if (this._status !== "running" || !this.mcpClient) { throw new Error("Backend not connected."); }
    const finalArgs = wrapToolArguments(name, args);
    const result = await this.mcpClient.callTool({ name, arguments: finalArgs });
    if (result.isError) { throw new Error(`Tool execution failed: ${JSON.stringify(result.content)}`); }
    return JSON.stringify(result);
  }

  dispose(): void {
    this.disconnect().catch(() => {});
    this._onNotification.dispose();
    this._onStatusChange.dispose();
  }
}
