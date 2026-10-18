/**
 * WrapperServer — Local HTTP server that bridges MCP JSON-RPC
 * requests from LLM to the remote backend via REST.
 *
 * Responsibilities:
 * - Accept MCP JSON-RPC on /mcp endpoint
 * - Route tools/list and tools/call
 * - Apply Base64ProxyService for schema rewrite and file proxy
 * - Handle CORS and health endpoint
 *
 * Collaborators (composition, see ./ submodules): RequestHandler (gate, CORS,
 * MCP dispatch), BodyReader (capped body read + drain), JsonRpcWriter
 * (JSON-RPC envelopes), ToolRouter (tool routing).
 */
import * as http from "http";
import { getActiveServers } from "./active-servers";
import { BodyReader } from "./body-reader";
import { DEFAULT_MAX_BODY_SIZE } from "./constants";
import { JsonRpcWriter } from "./json-rpc-writer";
import { RequestHandler } from "./request-handler";
import { ToolRouter } from "./tool-router";
import type { WrapperServerDeps } from "./types";

export class WrapperServer {
  private server: http.Server | null = null;
  private port: number | null = null;
  /** Effective body cap in bytes (DEFAULT_MAX_BODY_SIZE unless deps override). */
  private readonly maxBodySize: number;
  /** Track active sockets to force-close on stop (prevents port hang on reload). */
  private readonly activeSockets = new Set<import("net").Socket>();
  private readonly bodyReader: BodyReader;
  private readonly writer: JsonRpcWriter;
  private readonly toolRouter: ToolRouter;
  private readonly handler: RequestHandler;

  constructor(private readonly deps: WrapperServerDeps) {
    this.maxBodySize = deps.maxBodyBytes ?? DEFAULT_MAX_BODY_SIZE;
    this.bodyReader = new BodyReader(this.maxBodySize);
    this.writer = new JsonRpcWriter(this.maxBodySize);
    this.toolRouter = new ToolRouter(deps);
    this.handler = new RequestHandler(
      deps, this.maxBodySize, () => this.port, this.bodyReader, this.writer, this.toolRouter,
    );
  }

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
    return this.listenWithRetry(requestedPort);
  }

  private async listenWithRetry(requestedPort: number): Promise<void> {
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
      const srv = http.createServer((req, res) => this.handler.handle(req, res));
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

  async routeToolCall(params: any): Promise<any> {
    return this.toolRouter.routeToolCall(params);
  }
}
