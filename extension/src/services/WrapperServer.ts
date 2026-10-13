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
import { executeLocalTool, getLocalToolDefinitions, isLocalTool } from "../backend-local-tools";
import { Base64ProxyService } from "./Base64ProxyService";
import { evaluateOriginGate } from "./OriginGate";
import { PathResolverError, sanitizeLogText } from "./PathResolver";

/** Maximum body size (1MB) */
const MAX_BODY_SIZE = 1024 * 1024;

/**
 * Registry of live WrapperServer instances keyed by port, stored on globalThis.
 * Survives in-process extension reloads (which re-evaluate this module and would
 * otherwise reset a module-level Map) so a stale instance still listening on its
 * port is stopped before a new instance binds — prevents EADDRINUSE on reload.
 */
const ACTIVE_SERVERS_KEY = "__kiroWrapperActiveServers__";

function getActiveServers(): Map<number, WrapperServer> {
  const g = globalThis as Record<string, unknown>;
  if (!g[ACTIVE_SERVERS_KEY]) {
    g[ACTIVE_SERVERS_KEY] = new Map<number, WrapperServer>();
  }
  return g[ACTIVE_SERVERS_KEY] as Map<number, WrapperServer>;
}

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
  /** Track active sockets to force-close on stop (prevents port hang on reload). */
  private readonly activeSockets = new Set<import("net").Socket>();

  constructor(private readonly deps: WrapperServerDeps) {}

  get listeningPort(): number | null { return this.port; }

  /**
   * Raw bind address of the underlying http.Server — verify-only accessor for
   * the 127.0.0.1 loopback invariant (AC-7 / T8 / STC IT-08). No code change
   * to the bind call itself (FR-11).
   */
  get boundAddress(): string | null {
    if (!this.server) return null;
    const addr = this.server.address();
    return addr !== null && typeof addr === "object" ? addr.address : String(addr);
  }

  /** Number of attempts to bind before giving up. */
  private static readonly START_MAX_ATTEMPTS = 10;
  /** Delay between EADDRINUSE retries (ms) — lets a stale extension-host process release the port. */
  private static readonly START_RETRY_DELAY_MS = 400;

  async start(requestedPort: number): Promise<void> {
    // Stop a stale instance left over from a previous extension load that still
    // holds this port — otherwise reload fails with EADDRINUSE.
    const stale = getActiveServers().get(requestedPort);
    if (stale && stale !== this) {
      await stale.stop();
    }
    let lastErr: Error | undefined;
    for (let attempt = 1; attempt <= WrapperServer.START_MAX_ATTEMPTS; attempt++) {
      try {
        await this.tryListen(requestedPort);
        return;
      } catch (err) {
        lastErr = err as Error;
        // EADDRINUSE on reload is expected to clear once the previous extension-host
        // process finishes shutting down, so retry briefly instead of failing outright.
        if (attempt < WrapperServer.START_MAX_ATTEMPTS) {
          this.deps.outputChannel.appendLine(
            `[WrapperServer] Port ${requestedPort} busy (attempt ${attempt}/${WrapperServer.START_MAX_ATTEMPTS}), retrying...`
          );
          await new Promise((r) => setTimeout(r, WrapperServer.START_RETRY_DELAY_MS));
        }
      }
    }
    throw lastErr;
  }

  private async tryListen(requestedPort: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const srv = http.createServer((req, res) => this.handleRequest(req, res));
      // Track connections so stop() can force-destroy them (avoids port hang on reload)
      srv.on("connection", (socket) => {
        this.activeSockets.add(socket);
        socket.once("close", () => this.activeSockets.delete(socket));
      });
      srv.on("error", (err) => {
        this.deps.outputChannel.appendLine(`[WrapperServer] Error: ${err.message}`);
        if (!this.server) reject(err);
      });
      srv.listen(requestedPort, "127.0.0.1", () => {
        this.port = (srv.address() as import("net").AddressInfo).port;
        this.server = srv;
        getActiveServers().set(this.port, this);
        this.deps.outputChannel.appendLine(`[WrapperServer] Listening on port ${this.port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    // Destroy all active sockets first — prevents server.close() from hanging
    // when SSE streams or keep-alive connections are open (root cause of port conflict on reload)
    for (const socket of this.activeSockets) {
      socket.destroy();
    }
    this.activeSockets.clear();
    await new Promise<void>((resolve) => this.server!.close(() => resolve()));
    if (this.port !== null && getActiveServers().get(this.port) === this) {
      getActiveServers().delete(this.port);
    }
    this.server = null;
    this.port = null;
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // ── SA4E-358 gate (FR-01) — FIRST statement: no header is set before it. ──
    const gate = evaluateOriginGate(req.rawHeaders, this.port ?? 0);
    if (!gate.ok) {
      // Deny is the gate's happy path (AD-6) — 403 directly on a CLEAN res
      // (no setHeader happened), zero CORS headers (I-2/AC-8), reason stays
      // in the log only (FR-09). req.url sanitized at the call site (BR-04).
      this.deps.outputChannel.appendLine(
        `[WrapperServer] Denied request — reason=${gate.reason} origin=${gate.originSanitized} ` +
        `host=${gate.hostSanitized} (${req.method} ${sanitizeLogText(req.url ?? "/")})`
      );
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end('{"error":"Forbidden"}');
      return;
    }
    // ── CORS headers ONLY for callers with an allowlisted Origin (G-5) ──
    if (gate.echoOrigin !== null) {
      res.setHeader("Access-Control-Allow-Origin", gate.echoOrigin); // echo RAW (G-4) — never "*"
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.setHeader("Vary", "Origin"); // SEC-358-03
    }
    // ── current behavior from here on UNCHANGED (FR-10 / I-7) ──
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
    const u = new URL(req.url || "/", "http://localhost");
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
    try {
      const name = params.name as string;
      const args = (params.arguments || {}) as Record<string, unknown>;
      // NOTE: every delegating return is `return await` — a bare `return promise`
      // inside try/catch ADOPTS the promise OUTSIDE the try block, so a rejection
      // (e.g. PathResolverError from proxyInput) would escape this catch entirely
      // and leak as a JSON-RPC -32603 (classic async return-await gotcha).
      if (isLocalTool(name)) return await executeLocalTool(name, args);
      if (name === "find_tools") return await this.handleFindTools(args);
      if (name === "execute_dynamic_tool") return await this.handleDynamic(args);
      return await this.callWithProxy(name, args);
    } catch (err: any) {
      // SA4E-356 §5.6: path-resolution failures become MCP TOOL error results
      // (agent-readable Format 1/2 with CODE: prefix) — never JSON-RPC -32603.
      if (err instanceof PathResolverError) {
        this.deps.outputChannel.appendLine(`[WrapperServer] Path resolution failed: ${err.message}`);
        return { isError: true, content: [{ type: "text", text: err.message }] };
      }
      throw err;
    }
  }

  private async handleFindTools(args: Record<string, unknown>): Promise<any> {
    const result = await this.deps.restCallTool("find_tools", args);
    return this.rewriteFindToolsResponse(result);
  }

  private async handleDynamic(args: Record<string, unknown>): Promise<any> {
    const unwrapped = this.deps.base64Proxy.unwrapDynamicTool(args);
    if (!unwrapped) return this.deps.restCallTool("execute_dynamic_tool", args);
    const { toolName, innerArgs } = unwrapped;
    if (toolName === "find_tools") {
      const result = await this.deps.restCallTool("execute_dynamic_tool", args);
      return this.rewriteFindToolsResponse(result);
    }
    if (isLocalTool(toolName)) return executeLocalTool(toolName, innerArgs);
    const proxied = this.deps.base64Proxy.proxyInput(toolName, innerArgs);
    const finalArgs = this.deps.base64Proxy.wrapDynamicTool(args, proxied);
    let result = await this.deps.restCallTool("execute_dynamic_tool", finalArgs);
    result = this.deps.base64Proxy.proxyOutput(toolName, innerArgs, result);
    return result;
  }

  /**
   * Rewrite find_tools response: merge local tool definitions (stream_write_file,
   * embed_image, pega_*) so LLM can discover them, then rewrite base64 schemas.
   */
  private rewriteFindToolsResponse(result: any): any {
    if (!result?.content?.[0]?.text) return result;
    try {
      const parsed = JSON.parse(result.content[0].text);
      const tools = parsed.tools || parsed;
      if (!Array.isArray(tools)) return result;
      const merged = this.mergeLocalToolDefinitions(tools);
      const rewritten = this.deps.base64Proxy.rewriteSchemasForLlm(merged);
      const output = parsed.tools ? { ...parsed, tools: rewritten } : rewritten;
      return { ...result, content: [{ type: "text", text: JSON.stringify(output) }] };
    } catch (err) {
      // Not a valid tool list — return original result unchanged
      console.warn(`[WrapperServer] rewriteFindToolsResponse parse failed: ${(err as Error).message}`);
      return result;
    }
  }

  /** Append local tool definitions to a tool list, skipping duplicates by name. */
  private mergeLocalToolDefinitions(tools: any[]): any[] {
    const localDefs = getLocalToolDefinitions();
    const existing = new Set(tools.map((t) => t?.name));
    const added = localDefs.filter((d) => !existing.has(d.name));
    if (added.length === 0) return tools;
    return [...tools, ...added];
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
