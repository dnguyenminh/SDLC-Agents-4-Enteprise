/**
 * Shared types for the IndexerHttpClient family (BR-18 ≤200-lines split).
 * The first five interfaces are the original public surface, re-exported
 * verbatim from the IndexerHttpClient facade. The remaining aliases describe
 * internal HTTP result shapes (structure-identical to the inline types they
 * replace — no runtime impact).
 */

export interface DocEntry {
    path: string;
    type: string;
    ticket: string;
    format?: string;
    content?: string;
}

export interface FileEntry {
    path: string;
    content: string;
}

export interface UnconvertibleEntry {
    file: string;
    reason: string;
}

export interface IngestResult {
    ingested: number;
    errors: number;
    summary: string;
    unconvertible: UnconvertibleEntry[];
}

export interface UploadResult {
    uploaded: number;
    errors: number;
    summary: string;
}

/** Result of one raw POST/GET attempt (status 0 on network error). */
export interface PostAttemptResult {
    status: number;
    body: string;
}

/** Detailed POST result: ok flag, HTTP status, error envelope, optional 2xx body. */
export interface PostDetailResult {
    ok: boolean;
    error: string;
    details?: string;
    action?: string;
    status: number;
    body?: any;
}

/** Per-file rejection record reported by the index endpoints. */
export interface RejectionRecord {
    file: string;
    code: string;
    message: string;
}

/** SA4E-300: per-batch write outcome from a 200 index response. */
export interface BatchWriteOutcomeResult {
    written: number;
    failed: number;
    rejectedReasons: RejectionRecord[];
}

/** Runtime statics read by the retry drain (honors test-mutated delays). */
export interface FileRetryDelaySource {
    readonly FILE_RETRY_BASE_DELAY_MS: number;
    readonly FILE_RETRY_MAX_DELAY_MS: number;
}
