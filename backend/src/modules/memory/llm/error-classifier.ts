export type ProviderErrorKind = 'context_length' | 'transient' | 'auth' | 'not_found' | 'connectivity' | 'unknown';

export interface ProviderHttpError extends Error {
  status?: number;
  providerBody?: string;
  kind?: ProviderErrorKind;
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
    const base = this.flattenError(err);
    switch (kind) {
      case 'context_length':
        return `budget_error: context_length_exceeded | ${base.slice(0,200)}`;
      case 'auth':
        return `llm_auth: ${base.slice(0,200)}`;
      default:
        return base.slice(0,500);
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
