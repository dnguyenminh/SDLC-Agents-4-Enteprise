/**
 * SA4E-241 — Zod schemas for the checksum bulk-check + ingest contract (SEC-04).
 * Top-level schemas (code-standards: no inline schema). All external input is
 * validated with `safeParse` → 400 on failure. Defense-in-depth over the
 * already-parameterized SQL: bounds payload size (CWE-400) and rejects stray
 * characters before they reach the DB / logs.
 */
import { z } from 'zod';

/** projectId: letters/digits/underscore/dash only, 1..128 chars (SEC-04). */
export const ProjectIdSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);

/** checksum: lowercase hex — 40 (git-blob sha1) or 64 (sha256) (SEC-04). */
export const ChecksumSchema = z.string().regex(/^[0-9a-f]{40}$|^[0-9a-f]{64}$/);

/**
 * Bulk-check request. `projectId` is OPTIONAL — it is ONLY used to cross-check
 * against the authenticated identity (§8.2); the query scope always derives from
 * identity, never from the body. `checksums` capped at 5000 (SEC-04b, CWE-400).
 */
export const BulkCheckRequestSchema = z.object({
  projectId: ProjectIdSchema.optional(),
  checksums: z.array(ChecksumSchema).min(1).max(5000),
});

/** Bulk-check response (validated at the client by BulkCheckClient). */
export const BulkCheckResponseSchema = z.object({
  data: z.object({ existing: z.array(ChecksumSchema) }),
  error: z.null(),
});

export type BulkCheckRequest = z.infer<typeof BulkCheckRequestSchema>;
export type BulkCheckResponse = z.infer<typeof BulkCheckResponseSchema>;
