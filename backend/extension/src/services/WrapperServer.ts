/**
 * WrapperServer — Local HTTP server that bridges MCP JSON-RPC
 * requests from LLM to the remote backend via REST.
 *
 * Responsibilities:
 * - Accept MCP JSON-RPC on /mcp endpoint
 * - Route tools/list and tools/call
 * - Apply Base64ProxyService for schema rewrite and file proxy
 * - Handle CORS and health endpoint
 */
import * as http from "http";
import * as vscode from "vscode";
import { executeLocalTool } from "../backend-local-tools";
import { Base64ProxyService } from "./Base64ProxyService";

/** Maximum body size (1MB) */
const MAX_BODY_SIZE = 1024 * 1024;

/** Tools that execute locally without forwarding to backend */
const LOCAL_TOOLS = new Set(["stream_write_file", "embed_image"]);

export interface WrapperServerDeps {
  outputChannel: vscode.OutputChannel;
  base64Proxy: Base64ProxyService;
  restGetTools: () => Promise<any[]>;
  restCallTool: (name: string, args: Record<string, unknown>) => Promise<any>;
}

export class WrapperServer {
  private server: http.Server | null = null;
  private requestId = 0;
  private port: number | null = null;

  constructor(private readonly deps: WrapperServerDeps) {}

  get listeningPort(): number | null { return this.port; }

  async start(requestedPort: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const srv = http.createServer((req, res) => this.handleRequest(req, res));
      srv.on("error", (err) => {
        this.deps.outputChannel.appendLine(`[WrapperServer] Error: ${err.message}`);
        if (!this.server) reject(err);
      });
      srv.listen(requestedPort, "127.0.0.1", () => {
        this.port = (srv.address() as import("net").AddressInfo).port;
        this.server = srv;
        this.deps.outputChannel.appendLine(`[WrapperServer] Listening on port ${this.port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve) => this.server!.close(() => resolve()));
    this.server = null;
    this.port = null;
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const u = new URL(req.url || "/", "http://localhost");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
    try {
      if (u.pathname === "/mcp") { await this.handleMcp(req, res); return; }
      if (u.pathname === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end('{"status":"ok","mode":"wrapper"}');
        return;
      }
      res.writeHead(404); res.end('{"error":"Not found"}');
    } catch (err: unknown) {
      if (!res.headersSent) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: (err as Error).message }));
      }
    }
  }

  /**
   * Supported MCP protocol versions (newest first).
   * VS Code negotiates via the initialize request.
   */
  private static readonly PROTOCOL_VERSIONS = [
    "2025-06-18",
    "2025-03-26",
    "2024-11-05",
  ];

  private async handleMcp(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // Streamable HTTP: GET opens an SSE stream for server-initiated messages.
    if (req.method === "GET") { this.handleMcpGet(res); return; }
    if (req.method !== "POST") { res.writeHead(405); res.end('{"error":"Method not allowed"}'); return; }
    if (!(req.headers["content-type"] || "").includes("application/json")) {
      this.sendError(res, null, -32700, "Expected application/json");
      return;
    }
    const body = await this.readBody(req);
    let rpc: any;
    try { rpc = JSON.parse(body); } catch { this.sendError(res, null, -32700, "Parse error"); return; }
    if (rpc.id === undefined) rpc.id = ++this.requestId;
    try {
      // MCP lifecycle handshake — required by the protocol.
      if (rpc.method === "initialize") {
        const clientVersion = rpc.params?.protocolVersion as string | undefined;
        const negotiated = WrapperServer.PROTOCOL_VERSIONS.find((v) => v === clientVersion)
          || WrapperServer.PROTOCOL_VERSIONS[0];
        this.sendResult(res, rpc.id, {
          protocolVersion: negotiated,
          capabilities: {
            tools: { listChanged: false },
          },
          serverInfo: { name: "sdlc-agents-4-enterprise", version: "1.11.0" },
        });
        return;
      }
      // Notifications have no id and must not receive a response.
      if (rpc.method === "notifications/initialized" || rpc.method === "initialized") { res.writeHead(202); res.end(); return; }
      if (rpc.method === "ping") { this.sendResult(res, rpc.id, {}); return; }
      if (rpc.method === "tools/list") {
        const tools = await this.getToolsRewritten();
        this.sendResult(res, rpc.id, { tools });
        return;
      }
      if (rpc.method === "tools/call" && rpc.params) {
        const result = await this.routeToolCall(rpc.params);
        this.sendResult(res, rpc.id, result);
        return;
      }
      this.sendError(res, rpc.id, -32601, `Method not supported: ${rpc.method}`);
    } catch (err: any) {
      this.deps.outputChannel.appendLine(`[WrapperServer] Error: ${err.message}`);
      this.sendError(res, rpc.id, err.code || -32603, err.message);
    }
  }

  /**
   * GET /mcp — Streamable HTTP SSE channel for server-to-client messages.
   * VS Code opens this after initialize to receive unsolicited notifications.
   */
  private handleMcpGet(res: http.ServerResponse): void {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    });
    // SSE client needs 'endpoint' event to know where to POST (MCP SDK SSEClientTransport waits for this)
    res.write("event: endpoint\n");
    res.write("data: /mcp\n\n");
    res.write("event: message\n");
    res.write("data: {\"jsonrpc\":\"2.0\",\"method\":\"initialized\"}\n\n");
    const keepAlive = setInterval(() => {
      try { res.write(": keep-alive\n\n"); }
      catch (err) {
        console.debug(`[WrapperServer] keepalive write failed (non-fatal): ${(err as Error).message}`);
      }
    }, 15000);
    res.on("close", () => clearInterval(keepAlive));
  }

  private async getToolsRewritten(): Promise<any[]> {
    const tools = await this.deps.restGetTools();
    this.deps.base64Proxy.detectFromToolList(tools);
    return this.deps.base64Proxy.rewriteSchemasForLlm(tools);
  }

  async routeToolCall(params: any): Promise<any> {
    const name = params.name as string;
    const args = (params.arguments || {}) as Record<string, unknown>;
    if (LOCAL_TOOLS.has(name)) return executeLocalTool(name, args);
    if (name === "execute_dynamic_tool") return this.handleDynamic(args);
    return this.callWithProxy(name, args);
  }

  private async handleDynamic(args: Record<string, unknown>): Promise<any> {
    const unwrapped = this.deps.base64Proxy.unwrapDynamicTool(args);
    if (!unwrapped) return this.deps.restCallTool("execute_dynamic_tool", args);
    const { toolName, innerArgs } = unwrapped;
    if (toolName === "find_tools") {
      const result = await this.deps.restCallTool("execute_dynamic_tool", args);
      return this.rewriteFindToolsResponse(result);
    }
    const proxied = this.deps.base64Proxy.proxyInput(toolName, innerArgs);
    const finalArgs = this.deps.base64Proxy.wrapDynamicTool(args, proxied);
    let result = await this.deps.restCallTool("execute_dynamic_tool", finalArgs);
    result = this.deps.base64Proxy.proxyOutput(toolName, innerArgs, result);
    return result;
  }

  /** Rewrite find_tools response: hide content_base64, add output_path. */
  private rewriteFindToolsResponse(result: any): any {
    if (!result?.content?.[0]?.text) return result;
    try {
      const parsed = JSON.parse(result.content[0].text);
      const tools = parsed.tools || parsed;
      if (!Array.isArray(tools)) return result;
      const rewritten = this.deps.base64Proxy.rewriteSchemasForLlm(tools);
      const output = parsed.tools ? { ...parsed, tools: rewritten } : rewritten;
      return { ...result, content: [{ type: "text", text: JSON.stringify(output) }] };
    } catch (err) {
      // Not a valid tool list — return original result unchanged
      console.warn(`[WrapperServer] rewriteFindToolsResponse parse failed: ${(err as Error).message}`);
      return result;
    }
  }

  private async callWithProxy(name: string, args: Record<string, unknown>): Promise<any> {
    const finalArgs = this.deps.base64Proxy.proxyInput(name, args);
    let result = await this.deps.restCallTool(name, finalArgs);
    result = this.deps.base64Proxy.proxyOutput(name, args, result);
    return result;
  }

  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      req.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_BODY_SIZE) { req.destroy(); reject(new Error("Body too large")); return; }
        chunks.push(chunk);
      });
      req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
      req.on("error", reject);
    });
  }

  private sendResult(res: http.ServerResponse, id: any, result: any): void {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", id, result }));
  }

  private sendError(res: http.ServerResponse, id: any, code: number, message: string): void {
    res.writeHead(id === null ? 400 : 200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }));
  }
}
