/**
 * SA4E-362 FR-3 — Typed ingest auth error + log sanitization.
 */

/**
 * SA4E-362 FR-3 — Typed error báo hiệu auth đã chết sau refresh-retry (401 persists).
 * Bắt bằng instanceof (CẤM regex trên message — ≥4 format message, "HTTP 401" body rỗng miss mọi regex).
 * Export từ đây vì cả 3 throw sites nằm ở ingester; PegaBfsIndexer ĐÃ import từ facade — không cycle.
 */
export class IngestAuthError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "IngestAuthError"; // instance field — err.name đúng cả sau serialization
  }
}

/**
 * Typed error carrying the backend's CLASSIFIED ingest-failure envelope
 * (code + category + retryable) so the caller can decide retry-vs-skip and log a
 * concrete cause without reading server logs. Caught by instanceof, like
 * IngestAuthError. `retryable` mirrors the backend's transient/permanent split.
 */
export class IngestRejectedError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly category: string,
    public readonly retryable: boolean,
    public readonly errorName: string,
    public readonly httpStatus: number,
  ) {
    super(message);
    this.name = "IngestRejectedError"; // survives serialization
  }
}

/**
 * Thrown when the HTTP headers arrived but the response BODY could not be read
 * or parsed (socket closed mid-body / truncated / empty). This is a TRANSIENT
 * fault equivalent to a dropped connection, so it must be retried — not treated
 * as a permanent parse error. Caught by instanceof in isRetryableIngestError.
 * `cause` preserves the original undici error for diagnostics.
 */
export class TransientBodyError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "TransientBodyError";
  }
}

/**
 * SA4E-362 SEC-02 + SECA-01 (3.7): sanitize text embedded in IngestAuthError —
 * strip CR/LF first (a multi-line 401 body could inject forged log lines), then
 * cap at 200 characters.
 */
export function sanitizeIngestText(value: string): string {
  return value.replace(/[\r\n]+/g, " ").slice(0, 200);
}
