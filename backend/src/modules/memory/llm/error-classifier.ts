export type ProviderErrorKind = 'context_length' | 'transient' | 'auth' | 'not_found' | 'connectivity' | 'unknown';

export interface ProviderHttpError extends Error {
  status?: number;
  providerBody?: string;
  kind?: ProviderErrorKind;
}

/** D-SEC-08: single exposure cap for provider error messages on every exit path. */
const ERROR_MESSAGE_MAX_CHARS = 200;
/** D-SEC-09: providerBody is classification-only, in-memory; never logged/persisted/returned. */
const PROVIDER_BODY_MAX_CHARS = 2000;

/**
 * D-SEC-07 secret scrub (TDD §7.4 base pattern, extended to also consume the token
 * following the keyword — e.g. `Authorization: Bearer <key>` — so the credential
 * itself is removed, not just its first word). Applied case-insensitively.
 */
const SECRET_SCRUB_PATTERN = /\b(api[_-]?key|authorization|bearer|token)\b\s*[:=]?\s*\S+(?:\s+\S+)?/gi;

/** Scrub secret material (API keys / tokens) from arbitrary provider text. */
export function scrubSecrets(text: string): string {
  return String(text ?? '').replace(SECRET_SCRUB_PATTERN, '$1 ***');
}

/**
 * D-SEC-07/08/09: build a `ProviderHttpError` with redaction AT CONSTRUCT —
 * (a) secrets scrubbed, (b) `message` capped at 200 chars, (c) `kind` pre-computed,
 * (d) `providerBody` (≤2000) kept in memory for classification only and never
 * included in `message`.
 */
export function buildProviderHttpError(provider: string, status: number, body?: string): ProviderHttpError {
  const scrubbed = scrubSecrets(String(body ?? '').replace(/\s+/g, ' ').trim());
  const err = new Error(`${provider} error: ${status} ${scrubbed}`.slice(0, ERROR_MESSAGE_MAX_CHARS)) as ProviderHttpError;
  err.status = status;
  if (body) err.providerBody = body.slice(0, PROVIDER_BODY_MAX_CHARS);
  err.kind = ErrorClassifier.classify(err);
  return err;
}

export class ErrorClassifier {
  static isContextLengthError(err: unknown): boolean {
    if (!err) return false;
    const msg = this.flattenError(err);
    const patterns = [
      /context[_ -]?length/i,
      /maximum context/i,
      /prompt is too long/i,
      /exceeds .{0,40}(context|window)/i,
      /num_ctx/i,
    ];
    if (patterns.some(p => p.test(msg))) return true;
    const e = err as any;
    if (e?.providerBody) {
      try {
        const body = JSON.parse(e.providerBody);
        if (body?.error?.code === 'context_length_exceeded') return true;
      } catch {}
    }
    return false;
  }

  static classify(err: unknown): ProviderErrorKind {
    if (!err) return 'unknown';
    const e = err as any;
    if (e?.status === 401 || e?.status === 403 || /invalid api key/i.test(this.flattenError(err))) {
      return 'auth';
    }
    if (e?.status === 404 || /not found/i.test(this.flattenError(err))) {
      return 'not_found';
    }
    if (this.isConnectivityFailure(err)) return 'connectivity';
    if (this.isContextLengthError(err)) return 'context_length';
    if (e?.status === 429 || (e?.status >= 500 && e?.status < 600)) {
      return 'transient';
    }
    return 'unknown';
  }

  static toTaskMessage(kind: ProviderErrorKind, err: unknown): string {
    const base = scrubSecrets(this.flattenError(err));
    switch (kind) {
      case 'context_length':
        return `budget_error: context_length_exceeded | ${base}`.slice(0, ERROR_MESSAGE_MAX_CHARS);
      case 'auth':
        return `llm_auth: ${base}`.slice(0, ERROR_MESSAGE_MAX_CHARS);
      default:
        return base.slice(0, ERROR_MESSAGE_MAX_CHARS);
    }
  }

  private static flattenError(err: unknown): string {
    try {
      let msg = '';
      let current = err;
      for (let i = 0; i < 4 && current; i++) {
        if (typeof current === 'string') { msg += current; break; }
        if (current instanceof Error) {
          msg += current.message + ' ';
          current = (current as any).cause;
        } else if (current && typeof current === 'object' && 'message' in current) {
          msg += String((current as any).message) + ' ';
          current = (current as any).cause;
        } else {
          msg += JSON.stringify(current);
          break;
        }
      }
      return msg.trim();
    } catch {
      return String(err);
    }
  }

  private static isConnectivityFailure(err: unknown): boolean {
    const msg = this.flattenError(err).toLowerCase();
    return /connect|econnrefused|etimedout|network|abort|timeout/i.test(msg);
  }

  static attachProviderError(err: Error, status?: number, body?: string): ProviderHttpError {
    const e = err as ProviderHttpError;
    if (status) e.status = status;
    if (body) e.providerBody = body.slice(0, 2000);
    e.kind = this.classify(err);
    return e;
  }
}
