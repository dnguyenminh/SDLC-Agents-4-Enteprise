/**
 * ErrorClassifier — classifies LLM provider errors for SA4E-338 A2/D.
 *
 * Recognition rules (returns true for context_length):
 * 1. Flattened message (err.cause chain ≤ 4, via describeError) matches:
 *    /context[_ -]?length/i | /maximum context/i | /prompt is too long/i
 *    | /exceeds .{0,40}(context|window)/i | /num_ctx/i
 * 2. Parsed body has error.code === 'context_length_exceeded' (OpenAI/vLLM shape).
 *
 * Negative rules (must return false): connectivity failures, HTTP 401/403/404/429,
 * 5xx without context wording, JSON parse errors, null/non-Error inputs.
 */

import { describeError, isConnectivityFailure, type ErrorLike } from './llm-error.js';

export type ProviderErrorKind =
  | 'context_length'
  | 'transient'
  | 'auth'
  | 'not_found'
  | 'connectivity'
  | 'unknown';

const CONTEXT_LENGTH_PATTERNS = [
  /context[_ -]?length/i,
  /maximum context/i,
  /prompt is too long/i,
  /exceeds .{0,40}(context|window)/i,
  /num_ctx/i,
];

/** Try to extract a structured error body from the error object. */
function getProviderBody(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null;
  const e = err as Record<string, any>;
  // ProviderHttpError shape
  if (typeof e.providerBody === 'string') return e.providerBody;
  // Raw error message may contain the body after the status code
  if (typeof e.message === 'string') return e.message;
  return null;
}

/** Parse a JSON body fragment from an error message and check error.code. */
function hasContextLengthExceededCode(body: string): boolean {
  try {
    // The body may be the full response or a fragment — try to find the error object
    const parsed = JSON.parse(body) as any;
    const errObj = parsed?.error ?? parsed;
    if (errObj && typeof errObj === 'object' && errObj.code === 'context_length_exceeded') {
      return true;
    }
  } catch {
    // Not JSON — continue
  }
  return false;
}

/** Check if the flattened message matches any context-length pattern. */
function messageMatchesContextLength(msg: string): boolean {
  return CONTEXT_LENGTH_PATTERNS.some((re) => re.test(msg));
}

/** Extract HTTP status from error message (e.g. "Ollama error: 400 ..."). */
function extractStatus(err: unknown): number | null {
  if (!err || typeof err !== 'object') return null;
  const e = err as Record<string, any>;
  if (typeof e.status === 'number') return e.status;
  // Try to extract from message: "Provider error: <status> ..."
  if (typeof e.message === 'string') {
    const match = e.message.match(/(?:error:\s*)(\d{3})/);
    if (match) return parseInt(match[1], 10);
  }
  return null;
}

/** Check if the error is an auth error (401/403 or auth wording). */
function isAuthError(err: unknown): boolean {
  const status = extractStatus(err);
  if (status === 401 || status === 403) return true;
  const body = getProviderBody(err);
  if (body && /invalid.?api.?key|unauthorized|forbidden/i.test(body)) return true;
  return false;
}

/** Check if the error is a not-found error (404 or model not found wording). */
function isNotFound(err: unknown): boolean {
  const status = extractStatus(err);
  if (status === 404) return true;
  const body = getProviderBody(err);
  if (body && /not found|does not exist|model.*unknown/i.test(body)) return true;
  return false;
}

/** Check if the error is transient (429/5xx/timeout/connectivity). */
function isTransient(err: unknown): boolean {
  const status = extractStatus(err);
  if (status === 429) return true;
  if (status !== null && status >= 500) return true;
  if (isConnectivityFailure(err)) return true;
  const body = getProviderBody(err);
  if (body && /timeout|timed out|unavailable|503|502|500/i.test(body)) return true;
  return false;
}

/**
 * Returns true when the error represents a context-length exhaustion.
 * Pure — does not mutate the error.
 */
export function isContextLengthError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;

  // Negative: connectivity failures are never context-length
  if (isConnectivityFailure(err)) return false;

  // Negative: HTTP 401/403/404/429
  const status = extractStatus(err);
  if (status !== null) {
    if ([401, 403, 404, 429].includes(status)) return false;
    // 5xx without context wording — handled by isTransient, not context_length
    if (status >= 500) {
      const body = getProviderBody(err);
      if (!body || !messageMatchesContextLength(body)) return false;
    }
  }

  // Check 1: flattened message matches context-length patterns
  const flat = describeError(err);
  if (messageMatchesContextLength(flat)) return true;

  // Check 2: parsed body has error.code === 'context_length_exceeded'
  const body = getProviderBody(err);
  if (body && hasContextLengthExceededCode(body)) return true;

  return false;
}

/** Classify the error into a kind. Never throws. */
export function classifyError(err: unknown): ProviderErrorKind {
  if (!err || typeof err !== 'object') return 'unknown';

  if (isConnectivityFailure(err)) return 'connectivity';
  if (isAuthError(err)) return 'auth';
  if (isNotFound(err)) return 'not_found';
  if (isContextLengthError(err)) return 'context_length';
  if (isTransient(err)) return 'transient';
  return 'unknown';
}

/** Produce a task-message prefix for BudgetError / auth terminal routing. */
export function toTaskMessage(kind: ProviderErrorKind, err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  switch (kind) {
    case 'context_length':
      return `context_length_error: ${msg}`;
    case 'auth':
      return `llm_auth: ${msg}`;
    case 'transient':
      return `llm_transient: ${msg}`;
    case 'connectivity':
      return `llm_connectivity: ${msg}`;
    case 'not_found':
      return `llm_not_found: ${msg}`;
    default:
      return msg;
  }
}

/** Attach structured fields to an error for precise classification (§3.8). */
export function attachProviderError(
  err: Error,
  status?: number,
  providerBody?: string,
): Error {
  (err as any).status = status;
  (err as any).providerBody = providerBody;
  return err;
}
