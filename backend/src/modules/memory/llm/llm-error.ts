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
