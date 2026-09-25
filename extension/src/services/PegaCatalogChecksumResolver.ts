/**
 * SA4E-241 — PegaCatalogChecksumResolver. Resolves the authoritative checksum for
 * a catalog row using "Cách B" (extension always computes) with the CSV `checksum`
 * column used only to VERIFY/optimize:
 *   - column present + matches computed → use it (fast path, IC-A2)
 *   - column present + mismatches       → E-03 warning, use the COMPUTED value
 *   - column absent/malformed           → E-02, compute from the 3 fields (IC-A3)
 *
 * The extension NEVER trusts the column blindly — the computed value (NT-2) is the
 * source of truth so Source A (CSV) and Source B (interpolated) always agree (INV-1).
 */
import { computePegaChecksum } from "../code-intel/checksum/PegaRuleChecksumStrategy";
import type { RuleCatalogRow } from "../models";

type LogFn = (msg: string) => void;

/** Lowercase 64-char sha256 hex shape (the only valid Pega checksum form). */
const SHA256_HEX = /^[0-9a-f]{64}$/;

/** Outcome of resolving a row's checksum (for counters/telemetry). */
export interface ChecksumResolution {
  checksum: string;
  /** How the value was obtained — for E-02/E-03 reporting. */
  outcome: "verified" | "recomputed-mismatch" | "computed-missing";
}

/**
 * Resolve the checksum for one catalog row (Cách B). Always returns the COMPUTED
 * checksum; the column only decides which counter/warning fires.
 * @param row - Parsed catalog row (may or may not carry a `checksum` column)
 * @param log - Logger for E-02/E-03 diagnostics
 */
export function resolveRowChecksum(row: RuleCatalogRow, log: LogFn): ChecksumResolution {
  const computed = computePegaChecksum({
    pzInsKey: row.pzInsKey,
    pxUpdateDateTime: row.pxUpdateDateTime,
    pxSaveDateTime: row.pxSaveDateTime,
  });

  const column = (row.checksum ?? "").trim().toLowerCase();
  if (!column || !SHA256_HEX.test(column)) {
    // E-02: no usable column → the extension computes it (no crash, IC-A3).
    return { checksum: computed, outcome: "computed-missing" };
  }
  if (column !== computed) {
    // E-03: service column disagrees with the formula → trust computed, warn.
    log(`[Catalog] ⚠️ E-03 checksum mismatch for ${row.pzInsKey}: ` +
      `column=${column.slice(0, 12)}… computed=${computed.slice(0, 12)}… (using computed)`);
    return { checksum: computed, outcome: "recomputed-mismatch" };
  }
  return { checksum: computed, outcome: "verified" };
}
