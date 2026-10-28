/**
 * http-client-utils.ts — Simple HTTP utilities for internal use.
 * DRY: Eliminates raw http.request() boilerplate occurrences.
 * [v4.0] Refactored to use globalThis.fetch (proxy-patched) instead of raw http.request().
 * All calls now go through the global fetch patch → proxy-compliant.
 */

export interface HttpPostOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
}

/**
 * Generic JSON HTTP request via fetch (proxy-patched by global-fetch-patch.ts).
 * Rejects with HttpError on 4xx/5xx status codes.
 * Resolves with parsed response body on 2xx/3xx.
 */
async function httpRequestJson<T = unknown>(
  method: string,
  url: string,
  body?: unknown,
  options: HttpPostOptions = {}
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  Object.assign(headers, options.headers || {});

  const response = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30000),
  });

  const text = await response.text();

  if (response.status >= 400) {
    let parsed: any;
    try { parsed = JSON.parse(text); } catch { parsed = null; }
    const rawError = parsed?.error ?? text.slice(0, 200);
    const errMsg = formatErrorPayload(rawError);
    const err = new Error(`HTTP ${response.status}: ${errMsg}`);
    (err as any).status = response.status;
    (err as any).body = parsed;
    throw err;
  }

  try {
    return JSON.parse(text) as T;
  } catch (e) {
    throw new Error(`HTTP parse error: ${(e as Error).message} — body: ${text.slice(0, 200)}`);
  }
}

/** POST JSON to a URL, return parsed response body. */
export function httpPostJson<T = unknown>(
  url: string,
  body: unknown,
  options: HttpPostOptions = {}
): Promise<T> {
  return httpRequestJson<T>("POST", url, body, options);
}

/** GET from a URL, return parsed response body. */
export function httpGetJson<T = unknown>(
  url: string,
  options: HttpPostOptions = {}
): Promise<T> {
  return httpRequestJson<T>("GET", url, undefined, options);
}

/** PUT JSON to a URL, return parsed response body. */
export function httpPutJson<T = unknown>(
  url: string,
  body: unknown,
  options: HttpPostOptions = {}
): Promise<T> {
  return httpRequestJson<T>("PUT", url, body, options);
}

/** DELETE from a URL, return parsed response body. */
export function httpDeleteJson<T = unknown>(
  url: string,
  options: HttpPostOptions = {}
): Promise<T> {
  return httpRequestJson<T>("DELETE", url, undefined, options);
}

/**
 * Render an error payload into a human-readable message.
 * Backend error envelopes may carry `error` either as a string or as an object
 * (e.g. `{ code, message }` from the Knowledge service) — never surface
 * `[object Object]` for the latter.
 */
function formatErrorPayload(rawError: unknown): string {
  if (typeof rawError === "string") { return rawError; }
  if (rawError && typeof rawError === "object") {
    const msg = (rawError as { message?: unknown }).message;
    if (typeof msg === "string" && msg.length > 0) { return msg; }
    try { return JSON.stringify(rawError); } catch { return String(rawError); }
  }
  return String(rawError ?? "");
}

/**
 * Describe a fetch/undici error so a connection-level failure is diagnosable.
 *
 * undici throws a generic `TypeError: fetch failed` whose real reason lives in
 * `err.cause`. When ALL connection attempts to an address fail, that cause is an
 * `AggregateError` whose own `.message` is EMPTY and whose per-attempt errors
 * (ECONNREFUSED/ETIMEDOUT/ENOTFOUND, with address+port) sit in `.errors[]`.
 * Rendering only `cause.message` therefore prints "(cause: )" and the failure is
 * un-diagnosable from the log alone (SA4E Pega ingest).
 *
 * This unwraps that chain and surfaces the concrete syscall details:
 *   "AggregateError: connect ECONNREFUSED 127.0.0.1:48721 [ECONNREFUSED]"
 *
 * @param err - The error thrown by fetch (or any error).
 * @returns A single-line description including code/errno/address/port when present.
 */
export function describeFetchError(err: unknown): string {
  if (!err || typeof err !== "object") { return String(err ?? "unknown error"); }
  const e = err as Record<string, any>;

  // The low-level reason (if any) that undici attached.
  const cause = e.cause as Record<string, any> | undefined;

  // When the cause is an AggregateError, its own message is usually empty — the
  // real per-attempt errors are in `.errors[]`. Describe the first concrete one.
  const detail = describeSingleCause(cause) ?? describeSingleCause(e);
  const top = typeof e.message === "string" && e.message.length > 0 ? e.message : e.name ?? "Error";

  return detail && detail !== top ? `${top} (${detail})` : top;
}

/**
 * Render one error object (or the first entry of an AggregateError) into a
 * compact string with the OS-level fields that pinpoint a connection failure.
 */
function describeSingleCause(c: Record<string, any> | undefined): string | undefined {
  if (!c) { return undefined; }

  // AggregateError.errors[] holds the actual connect failures — take the first.
  const inner = Array.isArray(c.errors) && c.errors.length > 0 ? c.errors[0] : c;
  if (!inner || typeof inner !== "object") { return undefined; }

  const parts: string[] = [];
  if (typeof inner.message === "string" && inner.message.length > 0) { parts.push(inner.message); }
  const code = inner.code ?? inner.errno;
  if (code && !parts.join(" ").includes(String(code))) { parts.push(`[${code}]`); }
  if (inner.address) { parts.push(`addr=${inner.address}${inner.port ? `:${inner.port}` : ""}`); }

  const text = parts.join(" ").trim();
  return text.length > 0 ? text : undefined;
}

/** Transient network/socket error codes worth retrying with backoff. */
const TRANSIENT_FETCH_CODES = new Set([
  "UND_ERR_SOCKET",    // undici: "other side closed" — server closed TCP mid-flight
  "UND_ERR_CONNECT_TIMEOUT",
  "ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "EPIPE", "EAI_AGAIN",
]);

/**
 * Is this fetch/undici failure transient (safe to retry with backoff)?
 *
 * undici buries the real code in `err.cause` (and, when all connect attempts
 * fail, inside `cause.errors[]`). We walk that chain and also scan the rendered
 * description, since the "other side closed [UND_ERR_SOCKET]" Pega-ingest symptom
 * only surfaces its code once unwrapped. A timeout from AbortSignal.timeout()
 * (name === "TimeoutError") is likewise transient.
 *
 * @param err - The error thrown by fetch (or any error).
 * @returns true when the failure is a transient connection fault.
 */
export function isTransientFetchError(err: unknown): boolean {
  if (!err || typeof err !== "object") { return false; }
  const e = err as Record<string, any>;
  if (e.name === "TimeoutError" || e.name === "AbortError") { return true; }

  // Collect candidate codes from the error, its cause, and aggregated inner errors.
  const codes: string[] = [];
  const collect = (o: any): void => {
    if (!o || typeof o !== "object") { return; }
    if (typeof o.code === "string") { codes.push(o.code); }
    if (typeof o.errno === "string") { codes.push(o.errno); }
    if (Array.isArray(o.errors)) { for (const inner of o.errors) { collect(inner); } }
  };
  collect(e);
  collect(e.cause);
  if (codes.some((c) => TRANSIENT_FETCH_CODES.has(c))) { return true; }

  // Fallback: the unwrapped description sometimes carries the code as text only.
  const desc = describeFetchError(err);
  return [...TRANSIENT_FETCH_CODES].some((c) => desc.includes(c));
}
