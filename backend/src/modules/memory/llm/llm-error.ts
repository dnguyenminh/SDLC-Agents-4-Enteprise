/**
 * LLM connectivity error diagnostics.
 *
 * Node/undici wraps every network failure as a bare "fetch failed", hiding the
 * actionable cause (ECONNREFUSED 127.0.0.1:1234, DNS, timeout). These helpers
 * walk the `cause` chain so logs say WHY the LLM server is unreachable, and
 * classify connectivity failures so the expected "server not running yet"
 * retries log at warn instead of error (SA4E-336: `fetch failed` triage).
 */

/** Node/undici error shape plus the fields the cause chain carries. */
export type ErrorLike = Error & {
  code?: string;
  address?: string;
  port?: number;
  cause?: unknown;
  errors?: unknown[];
};

/** Error codes that mean "the LLM server is not reachable right now". */
const CONNECTIVITY_CODES = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT', 'EAI_AGAIN',
  'EHOSTUNREACH', 'ENETUNREACH', 'EPIPE', 'UND_ERR_SOCKET', 'ABORT_ERR',
]);

/** Max cause-chain depth to walk (defensive against cycles). */
const MAX_CAUSE_DEPTH = 4;

function asErrorLike(err: unknown): ErrorLike | null {
  return err instanceof Error ? (err as ErrorLike) : null;
}

/** One-line summary of a sub-error (no further `.errors` expansion). */
function subSummary(s: ErrorLike): string {
  const facts = [s.code, s.address ? (s.port ? `${s.address}:${s.port}` : s.address) : '']
    .filter(Boolean);
  return facts.length > 0 ? `${s.message} [${facts.join(' ')}]` : s.message;
}

/** Collect the machine-readable facts (code, address:port) of one error level. */
function describeLevel(e: ErrorLike): string {
  const parts = [e.message || e.name];
  const facts: string[] = [];
  if (e.code) facts.push(e.code);
  if (e.address) facts.push(e.port ? `${e.address}:${e.port}` : e.address);
  if (facts.length > 0) parts.push(`[${facts.join(' ')}]`);
  // AggregateError (multi-address connect) lists one sub-error per attempted address.
  const subs = (e.errors ?? []).map(asErrorLike).filter(Boolean) as ErrorLike[];
  if (subs.length > 0) {
    const shown = subs.slice(0, 3).map(subSummary).join('; ');
    const more = subs.length > 3 ? ` …+${subs.length - 3}` : '';
    parts.push(`(attempts: ${shown}${more})`);
  }
  return parts.join(' ');
}

/**
 * Flatten an error and its cause chain into one readable line.
 * `fetch failed <- connect ECONNREFUSED 127.0.0.1:1234` instead of `fetch failed`.
 */
export function describeError(err: unknown, depth = 0): string {
  const e = asErrorLike(err);
  if (!e || depth > MAX_CAUSE_DEPTH) return e ? describeLevel(e) : String(err);
  const own = describeLevel(e);
  if (e.cause && e.cause !== err) {
    const nested = describeError(e.cause, depth + 1);
    if (nested && nested !== own) return `${own} <- ${nested}`;
  }
  return own;
}

/** True when the chain is a network failure — expected while the LLM server is down. */
export function isConnectivityFailure(err: unknown, depth = 0): boolean {
  const e = asErrorLike(err);
  if (!e || depth > MAX_CAUSE_DEPTH) return false;
  if (e.name === 'AbortError' || e.name === 'TimeoutError') return true;
  if (e.code && CONNECTIVITY_CODES.has(e.code)) return true;
  if ((e.errors ?? []).some((x) => {
    const code = asErrorLike(x)?.code;
    return Boolean(code && CONNECTIVITY_CODES.has(code));
  })) return true;
  return isConnectivityFailure(e.cause, depth + 1);
}

/** Context-length patterns (matches Ollama / LM Studio / vLLM error shapes). */
const CONTEXT_LENGTH_PATTERNS = [
  /context[_ -]?length/i,
  /maximum context/i,
  /prompt is too long/i,
  /exceeds .{0,40}(context|window)/i,
  /num_ctx/i,
];

/** Extract HTTP status from an error object or message. */
function extractHttpStatus(err: unknown): number | null {
  if (!err || typeof err !== 'object') return null;
  const e = err as Record<string, any>;
  if (typeof e.status === 'number') return e.status;
  if (typeof e.message === 'string') {
    const m = e.message.match(/(?:error:\s*)(\d{3})/);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

/** Check if the flattened message matches any context-length pattern. */
function messageMatchesContextLength(msg: string): boolean {
  return CONTEXT_LENGTH_PATTERNS.some((re) => re.test(msg));
}

/**
 * SA4E-338 A2: returns true when err represents a context-length exhaustion.
 * Recognition: (a) flattened message matches context-length regexes, or
 * (b) parsed body has error.code === 'context_length_exceeded' (OpenAI/vLLM).
 * Negative rules: connectivity failures, HTTP 401/403/404/429, non-Error inputs.
 */
export function isContextLengthError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  if (isConnectivityFailure(err)) return false;
  const status = extractHttpStatus(err);
  if (status !== null) {
    if ([401, 403, 404, 429].includes(status)) return false;
    if (status >= 500) {
      const body = (err as Record<string, any>)?.providerBody ?? (err as Record<string, any>)?.message;
      if (!body || !messageMatchesContextLength(String(body))) return false;
    }
  }
  const flat = describeError(err);
  if (messageMatchesContextLength(flat)) return true;
  // Check error.code === 'context_length_exceeded' (OpenAI/vLLM shape)
  const e = err as Record<string, any>;
  if (e?.error?.code === 'context_length_exceeded') return true;
  if (e?.code === 'context_length_exceeded') return true;
  return false;
}
