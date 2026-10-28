/**
 * Classify ingest-path errors into a safe, structured envelope so the extension
 * can decide retry-vs-skip and show the user a cause WITHOUT reading server logs.
 *
 * SEC: we expose a stable `code`, a category, a retryable flag, and the error's
 * class name — but NEVER the raw stack, SQL text, or internal paths (those stay
 * in the server log only). The message is a classified, non-leaky summary.
 */

/** Stable error codes returned to the extension (contract — do not rename lightly). */
export type IngestErrorCode =
  | 'VALIDATION_ERROR'
  | 'MISSING_CHECKSUM'
  | 'DB_TRANSIENT'
  | 'DB_PERMANENT'
  | 'EXTRACTION_ERROR'
  | 'INTERNAL_ERROR';

/** Coarse category for UI grouping. */
export type IngestErrorCategory = 'validation' | 'database' | 'extraction' | 'unknown';

/**
 * Structured, log-free error detail for the response envelope.
 * `retryable` lets the extension distinguish a transient fault (retry with
 * backoff) from a permanent one (skip the rule, don't hammer the backend).
 */
export interface IngestErrorDetails {
  category: IngestErrorCategory;
  retryable: boolean;
  /** Error constructor name (e.g. "MissingChecksumError") — safe, no payload. */
  errorName: string;
}

/** Full classified result the route turns into `{ code, message, details }`. */
export interface ClassifiedIngestError {
  code: IngestErrorCode;
  message: string;
  details: IngestErrorDetails;
}

/** Postgres SQLSTATE classes/codes that are transient (worth a client retry). */
const TRANSIENT_PG_CODES = new Set([
  '08000', // connection_exception
  '08003', // connection_does_not_exist
  '08006', // connection_failure
  '40001', // serialization_failure
  '40P01', // deadlock_detected
  '53300', // too_many_connections
  '57P01', // admin_shutdown
  '57P03', // cannot_connect_now
]);

/** Node socket/network error codes that are transient. */
const TRANSIENT_NET_CODES = new Set([
  'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EPIPE', 'ENOTFOUND', 'EAI_AGAIN',
]);

/**
 * Classify an unknown thrown value into a safe envelope error.
 * @param err - The caught error (any shape).
 * @returns A classified, log-free error contract for the response body.
 */
export function classifyIngestError(err: unknown): ClassifiedIngestError {
  const name = err instanceof Error ? err.constructor.name : typeof err;
  const code = extractErrorCode(err);

  // 1. Known domain error: missing checksum → caller must upgrade (permanent).
  if (name === 'MissingChecksumError' || code === 'MISSING_CHECKSUM') {
    return build('MISSING_CHECKSUM',
      'Rule rejected: missing client-computed checksum. Upgrade the extension.',
      'validation', false, name);
  }

  // 2. Database faults — split transient (retry) vs permanent (skip).
  if (code && (TRANSIENT_PG_CODES.has(code) || TRANSIENT_NET_CODES.has(code))) {
    return build('DB_TRANSIENT',
      `Transient database/network fault (${code}). Safe to retry.`,
      'database', true, name);
  }
  if (isLikelyDbError(err, name)) {
    return build('DB_PERMANENT',
      'Database rejected the write (non-transient). Do not retry without a fix.',
      'database', false, name);
  }

  // 3. Fallback: unclassified internal error (treated as retryable-once by the
  //    extension is acceptable, but marked non-retryable here to avoid loops).
  return build('INTERNAL_ERROR',
    'Ingest failed due to an internal error. See the error code and category.',
    'unknown', false, name);
}

/** Classify a post-ingest extraction-phase failure (schema map / RelativeExtractor). */
export function classifyExtractionError(err: unknown): ClassifiedIngestError {
  const name = err instanceof Error ? err.constructor.name : typeof err;
  return build('EXTRACTION_ERROR',
    'Rule was ingested but dependency extraction failed. Rule stored; relatives unknown.',
    'extraction', false, name);
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function build(
  code: IngestErrorCode, message: string,
  category: IngestErrorCategory, retryable: boolean, errorName: string,
): ClassifiedIngestError {
  return { code, message, details: { category, retryable, errorName } };
}

/** Read a `.code` property (pg errors + Node syscall errors both expose one). */
function extractErrorCode(err: unknown): string | undefined {
  if (err && typeof err === 'object' && 'code' in err) {
    const c = (err as { code?: unknown }).code;
    if (typeof c === 'string' && c.length > 0) return c;
  }
  return undefined;
}

/** Heuristic: does this look like a DB error (has pg-style fields or name)? */
function isLikelyDbError(err: unknown, name: string): boolean {
  if (/postgres|database|query|sql/i.test(name)) return true;
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    // node-postgres errors carry severity/routine/schema fields.
    if ('severity' in e || 'routine' in e || 'sqlState' in e) return true;
  }
  return false;
}
