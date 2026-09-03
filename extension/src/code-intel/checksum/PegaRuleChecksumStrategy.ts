/**
 * SA4E-241 — PegaRuleChecksumStrategy (Source A CSV + Source B interpolated).
 * Formula (chốt, NT-2):
 *   sha256_hex( utf8( trim(pzInsKey) + "|" + trim(pxUpdateDateTime ?? "") + "|"
 *                     + trim(pxSaveDateTime ?? "") ) )
 * lowercase hex, separator "|", null→"", UTF-8, trim per field.
 *
 * `computePegaChecksum` is the SHARED function used by BOTH the CSV-verify path
 * and the interpolated/fetched-rule path (NT-1/NT-2) — guaranteeing a rule's
 * checksum is identical whether it arrives via CSV or via JSON fetch (INV-1).
 */
import * as crypto from "crypto";
import type { ChecksumStrategy, PegaRuleChecksumInput } from "./models/ChecksumModels";

/**
 * Compute the Pega rule checksum from its 3 basic fields (NT-1/NT-2).
 * Shared by Source A (CSV verify) and Source B (interpolated fetch).
 * @param r - Rule identity fields (pzInsKey + px update/save timestamps)
 * @returns lowercase sha256 hex (64 chars)
 */
export function computePegaChecksum(r: PegaRuleChecksumInput): string {
  // null/undefined → "" then trim (BR-04 normalization). Order is fixed:
  // pzInsKey | pxUpdateDateTime | pxSaveDateTime.
  const norm = (v?: string | null): string => (v ?? "").trim();
  const payload = `${norm(r.pzInsKey)}|${norm(r.pxUpdateDateTime)}|${norm(r.pxSaveDateTime)}`;
  return crypto.createHash("sha256").update(payload, "utf-8").digest("hex");
}

/** Strategy wrapper delegating to the shared computePegaChecksum (NT-2). */
export class PegaRuleChecksumStrategy implements ChecksumStrategy<PegaRuleChecksumInput> {
  readonly sourceKind = "pega-rule" as const;

  /** @inheritdoc */
  compute(input: PegaRuleChecksumInput): string {
    return computePegaChecksum(input);
  }
}
