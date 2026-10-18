/**
 * HTTP client for indexer operations — document ingestion and source file upload.
 * Delegates raw HTTP to http-client-utils for DRY compliance.
 *
 * BR-18 (≤200 physical lines/file) split: the implementation now lives in the
 * sibling ./IndexerHttpClientChain/ modules as an inheritance chain over
 * IndexerHttpClientCore (http-core → transport → retry → retry-drain →
 * upload-helpers → progress-statics → progress → kb-ingest → ingest-api →
 * upload-api → indexer-http-client), with shared parsing helpers in parsing.ts
 * and the mutable module state in state.ts. This file is a thin facade
 * re-exporting the exact public surface — existing import paths keep working
 * unchanged.
 */
export type {
    DocEntry,
    FileEntry,
    UnconvertibleEntry,
    IngestResult,
    UploadResult,
} from "./IndexerHttpClientChain/types";

export { IndexerHttpClient } from "./IndexerHttpClientChain/indexer-http-client";

export { parseIngestResponse, parseUnconvertible } from "./IndexerHttpClientChain/parsing";
