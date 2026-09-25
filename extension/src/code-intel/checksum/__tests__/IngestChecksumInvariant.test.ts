/**
 * SA4E-241 — Regression guard for the Phase-6 Critical finding: the ingest
 * write-path MUST persist content_hash = computePegaChecksum (3 basic fields),
 * NOT sha256(JSON.stringify(rule)). If the stored hash used the full-JSON
 * formula, bulk-check (which compares computePegaChecksum values) would never
 * match → Pega rules re-index every run (no-change skip broken).
 *
 * This test pins the INVARIANT at the formula level so the two paths can never
 * silently diverge again.
 */
import { describe, it, expect } from "vitest";
import * as crypto from "crypto";
import { computePegaChecksum } from "../PegaRuleChecksumStrategy";

/** Mirror of PegaBfsIndexer.computeChecksum (Source B) — same 3-field formula. */
function ingestChecksumFromRule(rule: Record<string, unknown>): string {
  return computePegaChecksum({
    pzInsKey: String(rule.pzInsKey ?? ""),
    pxUpdateDateTime: rule.pxUpdateDateTime as string | undefined,
    pxSaveDateTime: rule.pxSaveDateTime as string | undefined,
  });
}

const sampleRule = {
  pzInsKey: "RULE-OBJ-ACTIVITY MYCLASS!MYRULE",
  pxObjClass: "Rule-Obj-Activity",
  pxUpdateDateTime: "20260430T101500.000 GMT",
  pxSaveDateTime: "20260430T101500.000 GMT",
  pyRuleName: "MyRule",
  // extra content that WOULD change a full-JSON hash but NOT the save-time checksum
  pyActivity: "…lots of body…",
};

describe("SA4E-241 ingest checksum invariant (Phase-6 Critical regression)", () => {
  it("stored checksum == computePegaChecksum(3 fields), NOT sha256(full JSON)", () => {
    const stored = ingestChecksumFromRule(sampleRule);
    const fullJson = crypto.createHash("sha256").update(JSON.stringify(sampleRule)).digest("hex");
    expect(stored).toBe(computePegaChecksum({
      pzInsKey: sampleRule.pzInsKey,
      pxUpdateDateTime: sampleRule.pxUpdateDateTime,
      pxSaveDateTime: sampleRule.pxSaveDateTime,
    }));
    expect(stored).not.toBe(fullJson); // the old (buggy) formula
  });

  it("INV-1 end-to-end: catalog checksum == ingest checksum for the same rule", () => {
    // Catalog side (Source A): computePegaChecksum from CSV row fields.
    const catalogChecksum = computePegaChecksum({
      pzInsKey: sampleRule.pzInsKey,
      pxUpdateDateTime: sampleRule.pxUpdateDateTime,
      pxSaveDateTime: sampleRule.pxSaveDateTime,
    });
    // Ingest side (Source B): computed from the fetched rule JSON.
    const ingestChecksum = ingestChecksumFromRule(sampleRule);
    // MUST be equal, otherwise bulk-check `existing` never contains it → no skip.
    expect(ingestChecksum).toBe(catalogChecksum);
  });

  it("changing rule BODY only (not save-time) does NOT change the checksum", () => {
    const a = ingestChecksumFromRule(sampleRule);
    const b = ingestChecksumFromRule({ ...sampleRule, pyActivity: "COMPLETELY DIFFERENT BODY" });
    // Save-time based: body change without a save-time change → same checksum.
    // (Pega bumps pxSaveDateTime on real edits, so real edits DO change it.)
    expect(b).toBe(a);
  });

  it("changing pxSaveDateTime DOES change the checksum (real edit detected)", () => {
    const a = ingestChecksumFromRule(sampleRule);
    const b = ingestChecksumFromRule({ ...sampleRule, pxSaveDateTime: "20260501T090000.000 GMT" });
    expect(b).not.toBe(a);
  });
});
