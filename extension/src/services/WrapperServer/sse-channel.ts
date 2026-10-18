import * as http from "http";

/**
 * GET /mcp — Streamable HTTP SSE channel for server-to-client messages.
 * VS Code opens this after initialize to receive unsolicited notifications.
 */
export function openSseChannel(res: http.ServerResponse): void {
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
