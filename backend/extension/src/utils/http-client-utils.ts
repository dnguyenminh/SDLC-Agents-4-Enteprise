/**
 * http-client-utils.ts — Simple HTTP utilities for internal use.
 * DRY: Eliminates 11 raw http.request() boilerplate occurrences.
 */
import * as http from "http";
import * as https from "https";

export interface HttpPostOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
}

/**
 * POST JSON to a URL, return parsed response body.
 * Uses Node http/https module (not fetch) for compatibility with older VS Code environments.
 */
export function httpPostJson<T = unknown>(
  url: string,
  body: unknown,
  options: HttpPostOptions = {}
): Promise<T> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const parsed = new URL(url);
    const mod = parsed.protocol === "https:" ? https : http;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload).toString(),
      ...(options.headers || {}),
    };
    const req = mod.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || undefined,
        path: parsed.pathname + parsed.search,
        method: "POST",
        headers,
      },
      (res) => {
        let data = "";
        res.on("data", (c) => { data += c; });
        res.on("end", () => {
          try { resolve(JSON.parse(data) as T); }
          catch (e) { reject(new Error(`HTTP parse error: ${(e as Error).message} — body: ${data.slice(0, 200)}`)); }
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(options.timeoutMs || 30000, () => {
      req.destroy();
      reject(new Error(`HTTP timeout after ${options.timeoutMs || 30000}ms`));
    });
    req.write(payload);
    req.end();
  });
}

/**
 * GET from a URL, return parsed response body.
 */
export function httpGetJson<T = unknown>(
  url: string,
  options: HttpPostOptions = {}
): Promise<T> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === "https:" ? https : http;
    const req = mod.get(
      {
        hostname: parsed.hostname,
        port: parsed.port || undefined,
        path: parsed.pathname + parsed.search,
        headers: options.headers || {},
      },
      (res) => {
        let data = "";
        res.on("data", (c) => { data += c; });
        res.on("end", () => {
          try { resolve(JSON.parse(data) as T); }
          catch (e) { reject(new Error(`HTTP parse error: ${(e as Error).message}`)); }
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(options.timeoutMs || 10000, () => {
      req.destroy();
      reject(new Error(`HTTP GET timeout`));
    });
  });
}
