/**
 * SA4E-241 — zod schemas for the bulk-check protocol on the extension side.
 * Protocol/API responses MUST be validated with `safeParse` (code-standards).
 * Top-level schemas (no inline declaration).
 */
import { z } from "zod";

/** checksum: lowercase hex — 40 (git-blob sha1) or 64 (sha256). */
export const ChecksumSchema = z.string().regex(/^[0-9a-f]{40}$|^[0-9a-f]{64}$/);

/** Successful bulk-check response envelope: { data: { existing }, error: null }. */
export const BulkCheckResponseSchema = z.object({
  data: z.object({ existing: z.array(ChecksumSchema) }),
  error: z.null(),
});

export type BulkCheckResponse = z.infer<typeof BulkCheckResponseSchema>;
