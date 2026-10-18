import * as http from "http";
import { BodyTooLargeError } from "./body-too-large-error";

/** Max time spent draining an over-cap request remainder before giving up. */
const DRAIN_TIMEOUT_MS = 5000;

/**
 * Buffers request bodies up to a byte cap; on exceed it drains (bounded) the
 * remainder so a clean 413 can be delivered (SA4E-363).
 */
export class BodyReader {
  constructor(private readonly maxBodySize: number) {}

  /**
   * Buffer the request body up to maxBodySize bytes (strict `>` check on
   * cumulative bytes — a body of exactly the cap is accepted). On exceed:
   * latch a flag, FREE the accumulated chunks, and DRAIN the remainder
   * (bounded — see drainRemainder) before rejecting with BodyTooLargeError.
   * Draining first guarantees the client can actually read the 413 response
   * instead of hitting a mid-upload connection reset (the original SA4E-363
   * bug). The socket is never destroyed before the response is flushed.
   */
  readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      let tooLarge = false;
      req.on("data", (chunk: Buffer) => {
        if (tooLarge) return; // remainder is being drained — never re-buffer
        size += chunk.length;
        if (size <= this.maxBodySize) { chunks.push(chunk); return; }
        tooLarge = true;
        chunks.length = 0; // release buffered memory immediately (F-3)
        this.drainRemainder(req, reject);
      });
      req.on("end", () => {
        if (tooLarge) reject(new BodyTooLargeError());
        else resolve(Buffer.concat(chunks).toString("utf-8"));
      });
      // 'close' (without 'end') covers aborted requests and the pathological
      // drain give-up below — the promise keeps the typed sentinel either way.
      req.on("close", () => { if (tooLarge) reject(new BodyTooLargeError()); });
      req.on("error", reject);
    });
  }

  /**
   * Consume and discard the remainder of an over-cap request body so the 413
   * can be written and delivered without resetting the socket mid-upload.
   * The drain is BOUNDED (safety cap, dev-analysis §3.2): the remainder may
   * run up to maxBodySize extra bytes (i.e. any body up to ~2× cap always
   * gets a clean 413 — covers AC-5's far-above probe) or DRAIN_TIMEOUT_MS,
   * whichever comes first. Past the bound the stream is deemed pathological
   * (e.g. an infinite chunked flood): reject with the sentinel FIRST, then
   * destroy the socket — the response path sees res.destroyed and stays
   * silent, so the client sees a bare reset (same early-reject class as the
   * Hono bodyLimit / MCP SDK). Normal bodies drain in microseconds on
   * loopback and the socket is never destroyed before the 413 is flushed.
   */
  private drainRemainder(req: http.IncomingMessage, reject: (err: Error) => void): void {
    let drained = 0;
    let done = false;
    const onDiscard = (chunk: Buffer): void => {
      drained += chunk.length;
      if (drained > this.maxBodySize) giveUp();
    };
    const giveUp = (): void => {
      if (done) return;
      cleanup();
      reject(new BodyTooLargeError()); // latch BEFORE destroying so the sentinel wins
      req.destroy();
    };
    const cleanup = (): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      req.removeListener("data", onDiscard);
    };
    const timer = setTimeout(giveUp, DRAIN_TIMEOUT_MS);
    req.on("data", onDiscard);
    req.once("end", cleanup);
    req.once("close", cleanup);
  }
}
