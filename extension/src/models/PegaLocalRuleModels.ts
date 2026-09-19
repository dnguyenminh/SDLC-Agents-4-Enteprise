/**
 * PegaLocalRuleModels — Models for SA4E-301 prefer-local-on-checksum-match.
 * Zod schemas validate EXTERNAL JSON (local rule files + rules/.manifest.json)
 * and the discriminated result types carry the local-read outcome to the indexer.
 * Kept free of I/O so both the services and tests can reuse them (models standard).
 */
import { z } from "zod";

/** Relative location of the rule manifest inside a Pega workspace. */
export const MANIFEST_RELATIVE_PATH = "rules/.manifest.json";

/**
 * A local rule file (.pega.json) must carry pzInsKey plus at least one of the
 * two change timestamps — otherwise its checksum cannot match a catalog row
 * (which always has both) and the file must be re-downloaded (fail-safe).
 * Unknown extra fields are kept (passthrough) so the full rule JSON is preserved.
 */
export const LocalRuleJsonSchema = z
  .object({
    pzInsKey: z.string().min(1),
    pxUpdateDateTime: z.string().optional(),
    pxSaveDateTime: z.string().optional(),
  })
  .passthrough()
  .refine(
    (r) => Boolean(r.pxUpdateDateTime?.trim()) || Boolean(r.pxSaveDateTime?.trim()),
    { message: "rule must have pxUpdateDateTime or pxSaveDateTime" },
  );

/** rules/.manifest.json — flat map of pzInsKey → relativePath (strings only). */
export const RuleManifestSchema = z.record(z.string(), z.string());

/** Validated shape of a local rule file (core identity fields + passthrough). */
export type LocalRuleJson = z.infer<typeof LocalRuleJsonSchema>;

/** Why a local rule read did not serve the rule (caller falls back to download). */
export type LocalRuleReadReason =
  | "file-missing"
  | "unreadable"
  | "invalid-json"
  | "checksum-mismatch";

/** A local rule satisfied the checksum match — no network download needed. */
export interface LocalRuleHit {
  source: "local";
  rule: Record<string, unknown>;
  /** computePegaChecksum (3-field) of the local rule — the value sent to ingest (INV-1). */
  checksum: string;
}

/** A local rule could not be used — the caller falls back to server download. */
export interface LocalRuleMiss {
  source: "miss";
  reason: LocalRuleReadReason;
  detail?: string;
}

export type LocalRuleResult = LocalRuleHit | LocalRuleMiss;
