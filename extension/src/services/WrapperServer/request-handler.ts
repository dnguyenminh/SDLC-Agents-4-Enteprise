/**
 * RequestHandler — handles one HTTP request for WrapperServer: the SA4E-358
 * origin gate, CORS headers, /health, and the MCP protocol on /mcp
 * (initialize handshake, ping, tools/list, tools/call, SSE).
 */
import * as http from "http";
import { evaluateOriginGate } from "../OriginGate";
import type { OriginGateDeny } from "../OriginGate";
import { sanitizeLogText } from "../PathResolver";
import { BodyTooLargeError } from "./body-too-large-error";
import type { BodyReader } from "./body-reader";
import type { JsonRpcWriter } from "./json-rpc-writer";
import type { ToolRouter } from "./tool-router";
import { openSseChannel } from "./sse-channel";
import type { WrapperServerDeps } from "./types";

/**
 * Supported MCP protocol versions (newest first).
 * VS Code negotiates via the initialize request.
 */
const PROTOCOL_VERSIONS = [
  "2025-06-18",
  "2025-03-26",
  "2024-11-05",
];

export class RequestHandler {
  private requestId = 0;

  constructor(
    private readonly deps: WrapperServerDeps,
    private readonly maxBodySize: number,
    private readonly getPort: () => number | null,
    private readonly bodyReader: BodyReader,
    private readonly writer: JsonRpcWriter,
    private readonly toolRouter: ToolRouter,
  ) {}

  async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // ── SA4E-358 gate (FR-01) — FIRST statement: no header is set before it. ──
    const gate = evaluateOriginGate(req.rawHeaders, this.getPort() ?? 0);
    if (!gate.ok) { this.deny(req, res, gate); return; }
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
      await this.routeByPath(req, res, u);
    } catch (err: unknown) {
      this.sendInternalServerError(res, err);
    }
  }

  /**
   * Deny is the gate's happy path (AD-6) — 403 directly on a CLEAN res
   * (no setHeader happened), zero CORS headers (I-2/AC-8), reason stays
   * in the log only (FR-09). req.url sanitized at the call site (BR-04).
   */
  private deny(req: http.IncomingMessage, res: http.ServerResponse, gate: OriginGateDeny): void {
    this.deps.outputChannel.appendLine(
      `[WrapperServer] Denied request — reason=${gate.reason} origin=${gate.originSanitized} ` +
      `host=${gate.hostSanitized} (${req.method} ${sanitizeLogText(req.url ?? "/")})`
    );
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end('{"error":"Forbidden"}');
  }

  private async routeByPath(req: http.IncomingMessage, res: http.ServerResponse, u: URL): Promise<void> {
    if (u.pathname === "/mcp") { await this.handleMcp(req, res); return; }
    if (u.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end('{"status":"ok","mode":"wrapper"}');
      return;
    }
    res.writeHead(404); res.end('{"error":"Not found"}');
  }

  private sendInternalServerError(res: http.ServerResponse, err: unknown): void {
    if (!res.headersSent) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: (err as Error).message }));
    }
  }

  private async handleMcp(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // Streamable HTTP: GET opens an SSE stream for server-initiated messages.
    if (req.method === "GET") { openSseChannel(res); return; }
    if (req.method !== "POST") { res.writeHead(405); res.end('{"error":"Method not allowed"}'); return; }
    if (!(req.headers["content-type"] || "").includes("application/json")) {
      this.writer.sendError(res, null, -32700, "Expected application/json");
      return;
    }
    if (this.isDeclaredBodyTooLarge(req)) { this.writer.sendBodyTooLarge(res); return; }
    const body = await this.readBodyOr413(req, res);
    if (body === null) return;
    const rpc = this.parseRpcBody(body, res);
    if (rpc === undefined) return;
    if (rpc.id === undefined) rpc.id = ++this.requestId;
    try {
      await this.dispatchRpc(res, rpc);
    } catch (err: any) {
      this.handleRpcError(res, rpc, err);
    }
  }

  /**
   * Own try/catch AT the readBody call site — deliberately NOT inside the
   * rpc-parsing try below: its catch reads rpc.id, which is still undefined
   * here (TypeError trap, SA4E-363).
   */
  private async readBodyOr413(req: http.IncomingMessage, res: http.ServerResponse): Promise<string | null> {
    try { return await this.bodyReader.readBody(req); }
    catch (err) {
      if (err instanceof BodyTooLargeError) { this.writer.sendBodyTooLarge(res); return null; }
      throw err; // transport errors keep the existing handleRequest 500 path
    }
  }

  // Content-Length pre-check (SA4E-363, mirrors the MCP SDK's readRequestBody):
  // reject an over-cap DECLARED body before reading a single byte.
  // Number(undefined) → NaN → chunked bodies fall through to readBody's
  // cumulative streaming check.
  private isDeclaredBodyTooLarge(req: http.IncomingMessage): boolean {
    const declared = Number(req.headers["content-length"]);
    return Number.isFinite(declared) && declared > this.maxBodySize;
  }

  private parseRpcBody(body: string, res: http.ServerResponse): any {
    try { return JSON.parse(body); } catch { this.writer.sendError(res, null, -32700, "Parse error"); return undefined; }
  }

  private handleRpcError(res: http.ServerResponse, rpc: any, err: any): void {
    this.deps.outputChannel.appendLine(`[WrapperServer] Error: ${err.message}`);
    this.writer.sendError(res, rpc.id, err.code || -32603, err.message);
  }

  private async dispatchRpc(res: http.ServerResponse, rpc: any): Promise<void> {
    // MCP lifecycle handshake — required by the protocol.
    if (rpc.method === "initialize") { this.handleInitialize(res, rpc); return; }
    // Notifications have no id and must not receive a response.
    if (rpc.method === "notifications/initialized" || rpc.method === "initialized") { res.writeHead(202); res.end(); return; }
    if (rpc.method === "ping") { this.writer.sendResult(res, rpc.id, {}); return; }
    if (rpc.method === "tools/list") {
      const tools = await this.toolRouter.getToolsRewritten();
      this.writer.sendResult(res, rpc.id, { tools });
      return;
    }
    if (rpc.method === "tools/call" && rpc.params) {
      const result = await this.toolRouter.routeToolCall(rpc.params);
      this.writer.sendResult(res, rpc.id, result);
      return;
    }
    this.writer.sendError(res, rpc.id, -32601, `Method not supported: ${rpc.method}`);
  }

  private handleInitialize(res: http.ServerResponse, rpc: any): void {
    const clientVersion = rpc.params?.protocolVersion as string | undefined;
    const negotiated = PROTOCOL_VERSIONS.find((v) => v === clientVersion)
      || PROTOCOL_VERSIONS[0];
    this.writer.sendResult(res, rpc.id, {
      protocolVersion: negotiated,
      capabilities: {
        tools: { listChanged: false },
      },
      serverInfo: { name: "sdlc-agents-4-enterprise", version: "1.11.0" },
    });
  }
}
