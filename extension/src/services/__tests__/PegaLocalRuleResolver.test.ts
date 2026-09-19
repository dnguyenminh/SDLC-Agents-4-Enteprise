/**
 * SA4E-301 — PegaLocalRuleResolver unit tests (TC-UT-06..11):
 * checksum computation (3-field sha256, computed IN-TEST with node crypto),
 * manifest-first lookup (valid 2 entries, missing, corrupt, stale-entry) and
 * uppercase catalog-checksum comparison (case normalization).
 * Uses a REAL temp filesystem (os.tmpdir) — fs is NOT mocked here.
 */
import { describe, it, expect, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import { computePegaChecksum } from "../../code-intel/checksum/PegaRuleChecksumStrategy";
import {
  readRuleManifest,
  resolveLocalRulePath,
  readLocalRuleIfChecksumMatches,
} from "../PegaLocalRuleResolver";
import { MANIFEST_RELATIVE_PATH } from "../../models/PegaLocalRuleModels";

const roots: string[] = [];
function makeRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pega-local-"));
  roots.push(dir);
  return dir;
}
afterEach(() => {
  for (const r of roots.splice(0)) {
    try { fs.rmSync(r, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

const PZ_KEY = "RULE-OBJ-ACTIVITY WORK- CLAIMCREATE!ACTION";
const DATE = "20260919T100000.000 GMT";

/** 3-field sha256 checksum computed IN-TEST with node crypto (authoritative). */
function expectedChecksum(pzInsKey: string, update: string, save: string): string {
  const payload = `${pzInsKey.trim()}|${update.trim()}|${save.trim()}`;
  return crypto.createHash("sha256").update(payload, "utf-8").digest("hex");
}

function writeLocalRule(root: string, relPath: string, rule: Record<string, unknown>): string {
  const abs = path.join(root, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(rule, null, 2), "utf-8");
  return abs;
}

function writeManifest(root: string, entries: Record<string, string> | string): void {
  fs.mkdirSync(path.join(root, "rules"), { recursive: true });
  const raw = typeof entries === "string" ? entries : JSON.stringify(entries, null, 2);
  fs.writeFileSync(path.join(root, MANIFEST_RELATIVE_PATH), raw, "utf-8");
}

describe("computePegaChecksum — 3-field sha256 (TC-UT-06)", () => {
  it("TC-UT-06: sha256(trim(pzInsKey)|trim(pxUpdateDateTime)|trim(pxSaveDateTime)), lowercase hex", () => {
    const expected = expectedChecksum(PZ_KEY, DATE, DATE);
    const actual = computePegaChecksum({ pzInsKey: PZ_KEY, pxUpdateDateTime: DATE, pxSaveDateTime: DATE });
    expect(actual).toBe(expected);
    // Documented reference vector (TDD): must stay stable — INV-1 depends on it.
    expect(actual).toBe("33c2f8d923379eefc13669e173a426e88386c6751f2c0a904416cd8e8f7b7f40");
    expect(actual).toMatch(/^[0-9a-f]{64}$/);
  });

  it("TC-UT-06: field values are significant — changing a timestamp changes the hash", () => {
    const a = computePegaChecksum({ pzInsKey: PZ_KEY, pxUpdateDateTime: DATE, pxSaveDateTime: DATE });
    const b = computePegaChecksum({ pzInsKey: PZ_KEY, pxUpdateDateTime: "20260919T110000.000 GMT", pxSaveDateTime: DATE });
    expect(a).not.toBe(b);
  });
});

describe("resolveLocalRulePath — manifest-first lookup (TC-UT-07..10)", () => {
  it("TC-UT-07: valid manifest with 2 entries → both resolved via the manifest", async () => {
    const root = makeRoot();
    writeLocalRule(root, "rules/Rule-Obj-Activity/ClaimCreate.pega.json", { pzInsKey: PZ_KEY });
    writeLocalRule(root, "rules/Rule-Obj-Flow/OrderFlow.pega.json", { pzInsKey: "RULE-OBJ-FLOW WORK- ORDERFLOW" });
    writeManifest(root, {
      [PZ_KEY]: "rules/Rule-Obj-Activity/ClaimCreate.pega.json",
      "RULE-OBJ-FLOW WORK- ORDERFLOW": "rules/Rule-Obj-Flow/OrderFlow.pega.json",
    });

    expect(await resolveLocalRulePath(root, PZ_KEY, "Rule-Obj-Activity", ""))
      .toBe(path.join(root, "rules/Rule-Obj-Activity/ClaimCreate.pega.json"));
    expect(await resolveLocalRulePath(root, "RULE-OBJ-FLOW WORK- ORDERFLOW", "Rule-Obj-Flow", ""))
      .toBe(path.join(root, "rules/Rule-Obj-Flow/OrderFlow.pega.json"));
  });

  it("TC-UT-08: manifest missing → fallback derivation, no crash", async () => {
    const root = makeRoot();
    const abs = writeLocalRule(root, "rules/Rule-Obj-Activity/ClaimCreate.pega.json", { pzInsKey: PZ_KEY });
    const res = await resolveLocalRulePath(root, PZ_KEY, "Rule-Obj-Activity", "ClaimCreate");
    expect(res).toBe(abs);
  });

  it("TC-UT-09: manifest corrupt → zod error tolerated → fallback derivation", async () => {
    const root = makeRoot();
    writeManifest(root, "not valid json {{{");
    const abs = writeLocalRule(root, "rules/Rule-Obj-Activity/ClaimCreate.pega.json", { pzInsKey: PZ_KEY });
    expect(await resolveLocalRulePath(root, PZ_KEY, "Rule-Obj-Activity", "ClaimCreate")).toBe(abs);
    expect(await readRuleManifest(root)).toEqual({});
  });

  it("TC-UT-10: stale manifest entry (target file gone) → fallback to derived path", async () => {
    const root = makeRoot();
    writeManifest(root, { [PZ_KEY]: "rules/Rule-Obj-Activity/Gone.pega.json" });
    const abs = writeLocalRule(root, "rules/Rule-Obj-Activity/ClaimCreate.pega.json", { pzInsKey: PZ_KEY });
    expect(await resolveLocalRulePath(root, PZ_KEY, "Rule-Obj-Activity", "ClaimCreate")).toBe(abs);
  });
});

describe("readLocalRuleIfChecksumMatches — case normalization (TC-UT-11)", () => {
  it("TC-UT-11: uppercase catalog checksum vs lowercase computed → match via case normalization", async () => {
    const root = makeRoot();
    const rule = { pzInsKey: PZ_KEY, pxUpdateDateTime: DATE, pxSaveDateTime: DATE };
    writeLocalRule(root, "rules/Rule-Obj-Activity/ClaimCreate.pega.json", rule);
    const localChecksum = computePegaChecksum(rule);

    const res = await readLocalRuleIfChecksumMatches(
      root, PZ_KEY, localChecksum.toUpperCase(), "Rule-Obj-Activity", "ClaimCreate",
    );
    expect(res.source).toBe("local");
    if (res.source === "local") {
      expect(res.checksum).toBe(localChecksum);
      expect(res.rule.pzInsKey).toBe(PZ_KEY);
    }
  });

  it("TC-UT-11: empty catalog checksum → miss (cannot prove the local copy matches)", async () => {
    const root = makeRoot();
    writeLocalRule(root, "rules/Rule-Obj-Activity/ClaimCreate.pega.json", {
      pzInsKey: PZ_KEY, pxUpdateDateTime: DATE, pxSaveDateTime: DATE,
    });
    const res = await readLocalRuleIfChecksumMatches(root, PZ_KEY, undefined, "Rule-Obj-Activity", "ClaimCreate");
    expect(res).toEqual({ source: "miss", reason: "checksum-mismatch", detail: expect.any(String) });
  });
});
