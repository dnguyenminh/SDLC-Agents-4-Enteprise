/**
 * classify-llm-error — decide whether an LLM/gateway failure is worth retrying
 * on a DIFFERENT model (SA4E-289 PI-MODEL-FALLBACK).
 *
 * Root cause context: an OpenAI-compatible gateway (e.g. OmniRoute) routes a
 * request to an upstream provider. Some upstreams are unhealthy — they time out,
 * return 5xx, or emit provider-specific bootstrap errors (e.g. the Devin/agentic
 * "bridge sandbox" 500). Those are TRANSIENT to the model, not to the request, so
 * retrying the SAME prompt on another model is the correct recovery.
 *
 * By contrast, 4xx client errors (bad request, unauthorized, invalid model, quota)
 * are deterministic for the request — retrying another model wastes calls and, for
 * auth/quota, would fail identically. Those are NOT retryable here.
 */

/** Substrings that mark a transient upstream/gateway failure (case-insensitive). */
const RETRYABLE_MESSAGE_MARKERS: readonly string[] = [
  'bridge sandbox', // Devin/agentic bridge bootstrap failure (DEVIN_AGENTIC_HOME…)
  'devin_agentic',
  'timed out',
  'timeout',
  'etimedout',
  'econnreset',
  'econnrefused',
  'socket hang up',
  'network',
  'fetch failed',
  'aborted',
  'upstream',
  'bad gateway',
  'service unavailable',
  'gateway timeout',
  'overloaded',
  'temporarily unavailable',
  'internal server error',
];

/** HTTP status codes that indicate a transient upstream problem. */
function isRetryableStatus(status: number | undefined): boolean {
  if (typeof status !== 'number') return false;
  // 408 Request Timeout, 429 rate limit (worth trying a different/cheaper model),
  // and all 5xx (upstream broke) are retryable on another model.
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

/** Extract an HTTP status code from a variety of error shapes. */
export function extractStatus(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const e = err as Record<string, unknown>;
  const direct = e.status ?? e.statusCode ?? e.code;
  if (typeof direct === 'number') return direct;
  // pi-ai / OpenAI SDK style: error.response.status
  const response = e.response as Record<string, unknown> | undefined;
  if (response && typeof response.status === 'number') return response.status;
  // Some libs prefix the message: "OpenAI API error (500): …"
  const msg = typeof e.message === 'string' ? e.message : '';
  const m = msg.match(/\((\d{3})\)/) ?? msg.match(/\b(4\d\d|5\d\d)\b/);
  if (m) return Number(m[1]);
  return undefined;
}

/**
 * Decide whether `err` should trigger a retry on a different model.
 * @returns true when the failure is a transient upstream/gateway problem.
 */
export function isRetryableLlmError(err: unknown): boolean {
  const status = extractStatus(err);

  // Explicit non-retryable client errors: never fall back (auth/quota/bad request
  // fail identically on another model, or indicate a caller mistake). 429 is the
  // one 4xx we DO retry, handled by isRetryableStatus.
  if (typeof status === 'number' && status >= 400 && status < 500 && status !== 408 && status !== 429) {
    return false;
  }
  if (isRetryableStatus(status)) return true;

  const message = extractMessage(err).toLowerCase();
  return RETRYABLE_MESSAGE_MARKERS.some((marker) => message.includes(marker));
}

/** Pull a human-readable message out of Error, {message}, {code}, or raw values. */
function extractMessage(err: unknown): string {
  if (err instanceof Error) return `${err.message} ${(err as { code?: string }).code ?? ''}`;
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    const parts = [e.message, e.code, e.error, e.reason].filter((v) => typeof v === 'string');
    if (parts.length > 0) return parts.join(' ');
  }
  return String(err ?? '');
}
