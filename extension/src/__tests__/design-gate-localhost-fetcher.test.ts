/**
 * SA4E-393 Addendum 4 (SEC-F06) — localhost-fetcher size limit + Content-Type.
 */
import { describe, it, expect, afterEach } from "vitest";
import * as http from "http";
import { AddressInfo } from "net";
import { fetchLocalhostPage, resetCircuitBreaker } from "../slash/localhost-fetcher";

let server: http.Server | undefined;
afterEach(() => { server?.closeAllConnections?.(); server?.close(); server = undefined; resetCircuitBreaker(); });

/** Write chunks honouring backpressure so the full body really is sent. */
function pump(res: http.ServerResponse, chunks: Buffer[]): void {
  const next = (i: number): void => {
    for (let n = i; n < chunks.length; n++) {
      if (!res.write(chunks[n])) { res.once("drain", () => next(n + 1)); return; }
    }
    res.end();
  };
  next(0);
}

function serve(contentType: string, body: () => Buffer[]): Promise<string> {
  return new Promise((resolve) => {
    server = http.createServer((_req, res) => {
      res.writeHead(200, { "content-type": contentType });
      pump(res, body());
    }).listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${(server!.address() as AddressInfo).port}/`));
  });
}

describe("SEC-F06 oversize response", () => {
  it("rejects with FETCH_FAILED (no uncaught exception, no hang)", async () => {
    const chunk = Buffer.alloc(1024 * 1024, 97);
    const url = await serve("text/html", () => Array.from({ length: 12 }, () => chunk));
    await expect(fetchLocalhostPage(url)).rejects.toMatchObject({ code: "FETCH_FAILED" });
  }, 20000);
});

describe("SEC-F06 Content-Type parameters", () => {
  it("accepts text/html; charset=utf-8", async () => {
    const url = await serve("text/html; charset=utf-8", () => [Buffer.from("<p>ok</p>")]);
    await expect(fetchLocalhostPage(url)).resolves.toEqual({ success: true, html: "<p>ok</p>" });
  });

  it("still rejects a non-allowed media type", async () => {
    const url = await serve("image/png", () => [Buffer.from("x")]);
    await expect(fetchLocalhostPage(url)).rejects.toThrow(/Content-Type/);
  });

  it("SSRF guard intact: non-localhost host is rejected", async () => {
    await expect(fetchLocalhostPage("http://example.com/")).rejects.toThrow(/SSRF/);
  });
});
