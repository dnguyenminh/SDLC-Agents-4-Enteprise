/**
 * PegaLocalRuleIndex — local file+checksum skip (LR-01).
 * Verifies the extension can decide "already downloaded & unchanged" WITHOUT
 * any network call, and that a missing/corrupt index degrades to "fetch".
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PegaLocalRuleIndex } from "../PegaLocalRuleIndex";
import { computePegaChecksum } from "../../code-intel/checksum/PegaRuleChecksumStrategy";

let root: string;
let ruleFile: string;

const INS_KEY = "RULE-OBJ-CLASS MY-APP!RULE-HTML-SECTION!!MAIN";
const CHECKSUM = "a".repeat(64);

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "pega-local-index-"));
  ruleFile = path.join(root, "rules", "Rule-Obj-Activity", "Main.pega.json");
  fs.mkdirSync(path.dirname(ruleFile), { recursive: true });
  fs.writeFileSync(ruleFile, JSON.stringify({ pxObjClass: "Rule-Obj-Activity" }), "utf-8");
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("PegaLocalRuleIndex", () => {
  it("fetches when the index does not exist yet", () => {
    const idx = new PegaLocalRuleIndex(root);
    expect(idx.size).toBe(0);
    expect(idx.isUnchanged(INS_KEY, CHECKSUM)).toBe(false);
  });

  it("skips when the rule was recorded and the file still exists", () => {
    const idx = new PegaLocalRuleIndex(root);
    idx.record(INS_KEY, ruleFile, CHECKSUM);
    idx.flush();
    expect(idx.isUnchanged(INS_KEY, CHECKSUM)).toBe(true);
  });

  it("fetches when the checksum changed", () => {
    const idx = new PegaLocalRuleIndex(root);
    idx.record(INS_KEY, ruleFile, CHECKSUM);
    idx.flush();
    expect(idx.isUnchanged(INS_KEY, "b".repeat(64))).toBe(false);
  });

  it("fetches when the recorded file was deleted", () => {
    const idx = new PegaLocalRuleIndex(root);
    idx.record(INS_KEY, ruleFile, CHECKSUM);
    idx.flush();
    fs.rmSync(ruleFile);
    expect(idx.isUnchanged(INS_KEY, CHECKSUM)).toBe(false);
    expect(idx.prune()).toBe(1);
    expect(idx.size).toBe(0);
  });

  it("always fetches when no checksum is provided", () => {
    const idx = new PegaLocalRuleIndex(root);
    idx.record(INS_KEY, ruleFile, CHECKSUM);
    expect(idx.isUnchanged(INS_KEY, undefined)).toBe(false);
  });

  it("ignores a corrupt index file instead of throwing", () => {
    fs.mkdirSync(path.dirname(new PegaLocalRuleIndex(root).location), { recursive: true });
    fs.writeFileSync(new PegaLocalRuleIndex(root).location, "{not json", "utf-8");
    const idx = new PegaLocalRuleIndex(root);
    expect(idx.size).toBe(0);
    expect(idx.isUnchanged(INS_KEY, CHECKSUM)).toBe(false);
  });

  it("backfills from rules/ downloaded by earlier runs", () => {
    const rule = {
      pzInsKey: INS_KEY,
      pxUpdateDateTime: "20260101T000000.000 GMT",
      pxSaveDateTime: "20260101T000000.000 GMT",
    };
    const file = path.join(root, "rules", "Rule-Obj-Activity", "Main.pega.json");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(rule), "utf-8");

    const idx = new PegaLocalRuleIndex(root);
    expect(idx.backfill()).toBe(1);
    expect(idx.size).toBe(1);
    // The recorded checksum must equal the one a fresh run computes (NT-2).
    const expected = computePegaChecksum({
      pzInsKey: INS_KEY,
      pxUpdateDateTime: rule.pxUpdateDateTime,
      pxSaveDateTime: rule.pxSaveDateTime,
    });
    expect(idx.isUnchanged(INS_KEY, expected)).toBe(true);
    expect(idx.isUnchanged(INS_KEY, "c".repeat(64))).toBe(false);
    // Persisted → a second instance sees it without rescanning.
    const reloaded = new PegaLocalRuleIndex(root);
    expect(reloaded.size).toBe(1);
  });
});
