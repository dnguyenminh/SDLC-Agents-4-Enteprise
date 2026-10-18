import * as http from "http";

/**
 * Writes JSON-RPC response envelopes to an http.ServerResponse, including
 * the clean 413 path for over-cap request bodies (SA4E-363).
 */
export class JsonRpcWriter {
  constructor(private readonly maxBodySize: number) {}

  sendResult(res: http.ServerResponse, id: any, result: any): void {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", id, result }));
  }

  /**
   * Clean 413 for an over-cap body (SA4E-363): JSON-RPC envelope with
   * `id: null` (protocol-legal — the body was never parsed, so no id exists)
   * and a STATIC message including the effective cap (helps MCP agents
   * self-correct, leaks nothing — never echo attempted size/Origin/Host).
   */
  sendBodyTooLarge(res: http.ServerResponse): void {
    this.sendError(res, null, -32600, `Request body too large (max ${this.maxBodySize} bytes)`, 413);
  }

  sendError(res: http.ServerResponse, id: any, code: number, message: string, status?: number): void {
    if (res.destroyed) return; // socket torn down mid-flight — nothing can be written
    res.writeHead(status ?? (id === null ? 400 : 200), {
      "Content-Type": "application/json",
      // A 413 leaves the request body unconsumed — the socket must not be
      // reused for a keep-alive follow-up (request-smuggling hygiene, F-3).
      ...(status === 413 ? { Connection: "close" } : {}),
    });
    res.end(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }));
  }
}
