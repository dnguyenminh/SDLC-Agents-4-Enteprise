/**
 * Localhost single-request helper (SECURITY-REVIEW C4, SEC-F06).
 * One GET with a hard size cap and a media-type allowlist. All failures
 * reject the promise — nothing is thrown inside stream callbacks.
 */

import * as http from "http";
import * as https from "https";

import { DetectionError, createDetectionError } from "./types";

/** Response size limit per Condition C4. */
export const MAX_RESPONSE_SIZE = 10 * 1024 * 1024; // 10MB
/** Request timeout per Condition C4 (10s). */
export const FETCH_TIMEOUT = 10000;

/** Raw outcome of one request. */
export interface RawResponse { html: string; contentType?: string }

/**
 * Media type without parameters, lower-cased ("text/html; charset=utf-8" → "text/html").
 */
export function parseMediaType(contentType: string): string {
  return contentType.split(";")[0].trim().toLowerCase();
}

/** C4 allowlist: text/html or application/json (parameters ignored). */
export function isAllowedMediaType(contentType: string | undefined): boolean {
  if (!contentType) return true; // absent header is tolerated (as before)
  const media = parseMediaType(contentType);
  return media === "text/html" || media === "application/json";
}

/** Throws FETCH_FAILED when the response media type is not allowed. */
export function assertAllowedMediaType(contentType: string | undefined): void {
  if (!isAllowedMediaType(contentType)) {
    throw createDetectionError(DetectionError.FETCH_FAILED,
      `CORS block prevented fetch: unexpected Content-Type: ${contentType}`
    );
  }
}

function buildOptions(parsed: URL): http.RequestOptions {
  return {
    hostname: parsed.hostname,
    port: parsed.port,
    path: parsed.pathname + parsed.search,
    method: "GET",
    timeout: FETCH_TIMEOUT,
  };
}

/** Collect the body; oversize → destroy request and reject (SEC-F06). */
function collectBody(
  res: http.IncomingMessage, req: http.ClientRequest,
  resolve: (r: RawResponse) => void, reject: (e: Error) => void
): void {
  const chunks: Buffer[] = [];
  let size = 0;
  res.on("data", (chunk: Buffer | string) => {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buf.length;
    if (size > MAX_RESPONSE_SIZE) {
      req.destroy();
      reject(new Error("Response exceeds 10MB size limit"));
      return;
    }
    chunks.push(buf);
  });
  res.on("end", () => resolve({
    html: Buffer.concat(chunks).toString("utf-8"),
    contentType: res.headers["content-type"],
  }));
  res.on("error", reject);
}

/** Perform one GET against an already-validated localhost URL. */
export function requestOnce(urlString: string): Promise<RawResponse> {
  const parsed = new URL(urlString);
  const mod = parsed.protocol === "https:" ? https : http;
  return new Promise<RawResponse>((resolve, reject) => {
    const req = mod.get(buildOptions(parsed), (res) => collectBody(res, req, resolve, reject));
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Fetch timeout exceeded 10s"));
    });
  });
}
