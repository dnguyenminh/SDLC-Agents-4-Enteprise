/**
 * SA4E-301 — Integration tests: prefer-local-on-checksum-match (TC-IT-01..12).
 * REAL temp filesystem (os.tmpdir, per-test scoped, cleaned in afterEach) + REAL
 * BFS pipeline (PegaBfsIndexer → PegaBfsPipeline → PegaCrawlHelper →
 * PegaLocalRuleResolver → real fs). The HTTP boundary is SPIED, not wholesale
 * mocked: PegaHttpClient is a counted mock (the real Pega server cannot run
 * locally) and PegaStreamIngester.ingestSingleRule is a spy on the real instance.
 * The vscode module is aliased to the shared mock (vitest.config.ts);
 * workspace.getConfiguration is monkeypatched per test (existing mock style).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import * as vscode from "vscode";
import type { PegaHttpClient } from "../PegaHttpClient";
import { PegaBfsIndexer } from "../PegaBfsIndexer";
import { computePegaChecksum } from "../../code-intel/checksum/PegaRuleChecksumStrategy";
import { DiskBackedSet, type MembershipSet } from "../DiskBackedSet";
import { MANIFEST_RELATIVE_PATH } from "../../models/PegaLocalRuleModels";
import type { CrawlPlanItem } from "../../models";

const CONFIG_KEY = "pega.preferLocalOnChecksumMatch";
const PZ_KEY = "RULE-OBJ-ACTIVITY WORK- CLAIMCREATE!ACTION";
const RULE_CLASS = "Rule-Obj-Activity";
const DATE = "20260919T100000.000 GMT";
const FRESH_DATE = "20260919T140000.000 GMT";
const PROJECT_ID = "abc123def456";

/** 3-field sha256 checksum computed IN-TEST with node crypto (authoritative). */
function checksumOf(pzInsKey: string, update: string, save: string): string {
  return crypto.createHash("sha256")
    .update(`${pzInsKey.trim()}|${update.trim()}|${save.trim()}`, "utf-8")
    .digest("hex");
}

/** Harness: real temp workspace + HTTP spies, rebuilt per test. */
let root: string;
let pegaClient: {
  getConfiguredUsername: () => undefined;
  getObject: ReturnType<typeof vi.fn>;
  getRuleByInsKey: ReturnType<typeof vi.fn>;
  getClassRules: ReturnType<typeof vi.fn>;
};
let ingestSpy: ReturnType<typeof vi.fn>;
let logSpy: ReturnType<typeof vi.fn>;
let dedupSet: MembershipSet;
let originalGetConfiguration: unknown;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "pega-local-it-"));
  pegaClient = {
    getConfiguredUsername: () => undefined, // skips the latency probe (no network)
    getObject: vi.fn(),
    getRuleByInsKey: vi.fn(), // HTTP spy — counted per test
    getClassRules: vi.fn(),
  };
  logSpy = vi.fn();
  // Real DiskBackedSet (pure class — createPegaDedupSet uses a lazy require('vscode')
  // that vitest aliases don't intercept at runtime, so we construct it directly).
  dedupSet = new DiskBackedSet(path.join(root, ".pega-cache", "dedup-prefer-local-it.bin"));
  originalGetConfiguration = (vscode.workspace as any).getConfiguration;
});

afterEach(() => {
  dedupSet.dispose();
  (vscode.workspace as any).getConfiguration = originalGetConfiguration;
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ }
});

/** Seed a real local rule file under rules/<class>/<name>.pega.json. */
function seedLocalRule(relName: string, rule: Record<string, unknown>): string {
  const abs = path.join(root, "rules", RULE_CLASS, `${relName}.pega.json`);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(rule, null, 2), "utf-8");
  return abs;
}

/** Seed rules/.manifest.json (real fs). A string seeds raw (corrupt) content. */
function seedManifest(entries: Record<string, string> | string): void {
  fs.mkdirSync(path.join(root, "rules"), { recursive: true });
  const raw = typeof entries === "string" ? entries : JSON.stringify(entries, null, 2);
  fs.writeFileSync(path.join(root, MANIFEST_RELATIVE_PATH), raw, "utf-8");
}

function toRelative(abs: string): string {
  return path.relative(root, abs).replace(/\\/g, "/");
}

/** Monkeypatch the aliased vscode mock's getConfiguration (existing test style). */
function setConfig(values: Record<string, unknown>): void {
  (vscode.workspace as any).getConfiguration = (section?: string) => ({
    get: (key: string, def?: unknown) => (section === "kiroSdlc" && key in values ? values[key] : def),
  });
}

/** Build the indexer; the ingest HTTP boundary is spied on the real ingester. */
function buildIndexer(): PegaBfsIndexer {
  const indexer = new PegaBfsIndexer(
    pegaClient as unknown as PegaHttpClient, "http://127.0.0.1:48721", undefined, logSpy,
  );
  ingestSpy = vi.fn().mockResolvedValue({ status: "success", ruleId: 1, unresolvedDependencies: [] });
  (indexer as any).ingester.ingestSingleRule = ingestSpy;
  return indexer;
}

/** Catalog-sourced crawl item (pyRuleName empty → fetched by insKey). */
function catalogItem(checksum: string, insKey = PZ_KEY): CrawlPlanItem {
  return { insKey, pxObjClass: RULE_CLASS, pyClassName: "Work-", pyRuleName: "", checksum };
}

const report = { report: (_m: { message?: string }) => {} };
const runTest = async (items: CrawlPlanItem[]) =>
  buildIndexer().run(PROJECT_ID, items, dedupSet, report as never, root);

describe("PegaBfsIndexer — Prefer Local On Checksum Match (SA4E-301, IT)", () => {
  it("TC-IT-01: warm-cache match — 0 network calls, local content served", async () => {
    setConfig({});
    const cs = checksumOf(PZ_KEY, DATE, DATE);
    seedLocalRule("ClaimCreate", {
      pzInsKey: PZ_KEY, pxObjClass: RULE_CLASS, pyRuleName: "ClaimCreate",
      pxUpdateDateTime: DATE, pxSaveDateTime: DATE,
    });
    seedManifest({ [PZ_KEY]: `rules/${RULE_CLASS}/ClaimCreate.pega.json` });

    const result = await runTest([catalogItem(cs)]);

    expect(pegaClient.getRuleByInsKey).not.toHaveBeenCalled();
    expect(pegaClient.getObject).not.toHaveBeenCalled();
    expect(ingestSpy).toHaveBeenCalledTimes(1);
    expect(result.localServed).toBe(1);
    expect(result.downloaded).toBe(0);
    expect(ingestSpy.mock.calls[0][2]).toBe(cs); // INV-1: 3-field checksum
  });

  it("TC-IT-02: stale checksum mismatch → fallback download + warning; stale never ingested", async () => {
    setConfig({});
    seedLocalRule("ClaimCreate", {
      pzInsKey: PZ_KEY, pxObjClass: RULE_CLASS, pyRuleName: "ClaimCreate",
      pxUpdateDateTime: "20260101T100000.000 GMT", pxSaveDateTime: "20260101T100000.000 GMT",
    });
    seedManifest({ [PZ_KEY]: `rules/${RULE_CLASS}/ClaimCreate.pega.json` });
    const freshRule = {
      pzInsKey: PZ_KEY, pxObjClass: RULE_CLASS, pyRuleName: "ClaimCreate",
      pxUpdateDateTime: FRESH_DATE, pxSaveDateTime: FRESH_DATE,
    };
    const freshCs = checksumOf(PZ_KEY, FRESH_DATE, FRESH_DATE);
    pegaClient.getRuleByInsKey.mockResolvedValue(freshRule);

    const result = await runTest([catalogItem(freshCs)]);

    expect(pegaClient.getRuleByInsKey).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Checksum mismatch"));
    expect(ingestSpy).toHaveBeenCalledTimes(1);
    // Stale content never ingested — the FRESH rule reached the backend.
    expect(ingestSpy.mock.calls[0][1].pxUpdateDateTime).toBe(FRESH_DATE);
    expect(ingestSpy.mock.calls[0][2]).toBe(freshCs);
    expect(result.downloaded).toBe(1);
    expect(result.localServed).toBe(0);
  });

  it("TC-IT-03: new rule (no local file, no manifest entry) → fallback download", async () => {
    setConfig({});
    pegaClient.getRuleByInsKey.mockResolvedValue({
      pzInsKey: PZ_KEY, pxObjClass: RULE_CLASS, pyRuleName: "ClaimCreate",
      pxUpdateDateTime: DATE, pxSaveDateTime: DATE,
    });

    const result = await runTest([catalogItem(checksumOf(PZ_KEY, DATE, DATE))]);

    expect(pegaClient.getRuleByInsKey).toHaveBeenCalledTimes(1);
    expect(ingestSpy).toHaveBeenCalledTimes(1);
    expect(result.downloaded).toBe(1);
    expect(result.localServed).toBe(0);
  });

  it("TC-IT-04: corrupt local JSON → fallback, no crash", async () => {
    setConfig({});
    const abs = seedLocalRule("ClaimCreate", {});
    fs.writeFileSync(abs, "{corrupt json", "utf-8");
    seedManifest({ [PZ_KEY]: `rules/${RULE_CLASS}/ClaimCreate.pega.json` });
    pegaClient.getRuleByInsKey.mockResolvedValue({
      pzInsKey: PZ_KEY, pxObjClass: RULE_CLASS, pyRuleName: "ClaimCreate",
      pxUpdateDateTime: DATE, pxSaveDateTime: DATE,
    });

    const result = await runTest([catalogItem(checksumOf(PZ_KEY, DATE, DATE))]);

    expect(pegaClient.getRuleByInsKey).toHaveBeenCalledTimes(1); // fallback happened
    expect(ingestSpy).toHaveBeenCalledTimes(1);
    expect(result.downloaded).toBe(1);
    expect(result.localServed).toBe(0);
  });

  it("TC-IT-05: local JSON missing the 3 identity fields → fallback", async () => {
    setConfig({});
    seedLocalRule("ClaimCreate", { pxObjClass: RULE_CLASS, pyRuleName: "ClaimCreate", someOther: "field" });
    seedManifest({ [PZ_KEY]: `rules/${RULE_CLASS}/ClaimCreate.pega.json` });
    pegaClient.getRuleByInsKey.mockResolvedValue({
      pzInsKey: PZ_KEY, pxObjClass: RULE_CLASS, pyRuleName: "ClaimCreate",
      pxUpdateDateTime: DATE, pxSaveDateTime: DATE,
    });

    const result = await runTest([catalogItem(checksumOf(PZ_KEY, DATE, DATE))]);

    expect(pegaClient.getRuleByInsKey).toHaveBeenCalledTimes(1);
    expect(ingestSpy).toHaveBeenCalledTimes(1);
    expect(result.downloaded).toBe(1);
  });

  it("TC-IT-06: unreadable local file (EACCES) → fallback", async () => {
    setConfig({});
    const cs = checksumOf(PZ_KEY, DATE, DATE);
    const abs = seedLocalRule("ClaimCreate", {
      pzInsKey: PZ_KEY, pxUpdateDateTime: DATE, pxSaveDateTime: DATE,
    });
    seedManifest({ [PZ_KEY]: `rules/${RULE_CLASS}/ClaimCreate.pega.json` });

    // chmod when the platform allows; on Windows the read-only attribute does NOT
    // block reads, so EACCES cannot be reproduced → skip-with-warning (spec).
    let unreadable = false;
    try {
      fs.chmodSync(abs, 0o000);
      fs.readFileSync(abs, "utf-8");
    } catch {
      unreadable = true;
    }
    if (!unreadable) {
      console.warn("⚠️ TC-IT-06: platform does not produce EACCES via chmod — unreadable-file scenario skipped (fallback covered by TC-IT-04/05).");
      fs.chmodSync(abs, 0o644);
      return;
    }

    pegaClient.getRuleByInsKey.mockResolvedValue({
      pzInsKey: PZ_KEY, pxObjClass: RULE_CLASS, pyRuleName: "ClaimCreate",
      pxUpdateDateTime: DATE, pxSaveDateTime: DATE,
    });

    const result = await runTest([catalogItem(cs)]);

    expect(pegaClient.getRuleByInsKey).toHaveBeenCalledTimes(1);
    expect(result.downloaded).toBe(1);
    expect(result.localServed).toBe(0);
  });

  it("TC-IT-07: setting OFF → always downloads, even with a matching local copy", async () => {
    setConfig({ [CONFIG_KEY]: false });
    seedLocalRule("ClaimCreate", {
      pzInsKey: PZ_KEY, pxUpdateDateTime: DATE, pxSaveDateTime: DATE,
    });
    seedManifest({ [PZ_KEY]: `rules/${RULE_CLASS}/ClaimCreate.pega.json` });
    pegaClient.getRuleByInsKey.mockResolvedValue({
      pzInsKey: PZ_KEY, pxObjClass: RULE_CLASS, pyRuleName: "ClaimCreate",
      pxUpdateDateTime: DATE, pxSaveDateTime: DATE,
    });

    const result = await runTest([catalogItem(checksumOf(PZ_KEY, DATE, DATE))]);

    expect(pegaClient.getRuleByInsKey).toHaveBeenCalledTimes(1);
    expect(result.downloaded).toBe(1);
    expect(result.localServed).toBe(0);
  });

  it("TC-IT-08: telemetry — summary line reports local-cache counts", async () => {
    setConfig({});
    seedLocalRule("ClaimCreate", {
      pzInsKey: PZ_KEY, pxUpdateDateTime: DATE, pxSaveDateTime: DATE,
    });
    seedManifest({ [PZ_KEY]: `rules/${RULE_CLASS}/ClaimCreate.pega.json` });

    await runTest([catalogItem(checksumOf(PZ_KEY, DATE, DATE))]);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("🏛️ Pega: 1 rules — 1 from local cache, 0 downloaded"),
    );
  });

  it("TC-IT-09: saveRuleFile writes rules/.manifest.json (pzInsKey → relativePath)", async () => {
    setConfig({});
    pegaClient.getRuleByInsKey.mockResolvedValue({
      pzInsKey: PZ_KEY, pxObjClass: RULE_CLASS, pyRuleName: "ClaimCreate",
      pxUpdateDateTime: DATE, pxSaveDateTime: DATE,
    });

    await runTest([catalogItem("f".repeat(64))]);

    const manifestPath = path.join(root, MANIFEST_RELATIVE_PATH);
    expect(fs.existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    expect(manifest[PZ_KEY]).toBe(`rules/${RULE_CLASS}/ClaimCreate.pega.json`);
    // Idempotent: the mapped relativePath really exists on disk.
    expect(fs.existsSync(path.join(root, manifest[PZ_KEY]))).toBe(true);
  });

  it("TC-IT-10: mixed batch — counts split correctly (1 local, 1 downloaded)", async () => {
    setConfig({});
    const OTHER_KEY = "RULE-OBJ-FLOW WORK- ORDERFLOW";
    const cs = checksumOf(PZ_KEY, DATE, DATE);
    seedLocalRule("ClaimCreate", {
      pzInsKey: PZ_KEY, pxUpdateDateTime: DATE, pxSaveDateTime: DATE,
    });
    seedManifest({ [PZ_KEY]: `rules/${RULE_CLASS}/ClaimCreate.pega.json` });
    pegaClient.getRuleByInsKey.mockResolvedValue({
      pzInsKey: OTHER_KEY, pxObjClass: "Rule-Obj-Flow", pyRuleName: "OrderFlow",
      pxUpdateDateTime: DATE, pxSaveDateTime: DATE,
    });

    const items = [catalogItem(cs), catalogItem(checksumOf(OTHER_KEY, DATE, DATE), OTHER_KEY)];
    const result = await runTest(items);

    expect(result.localServed).toBe(1);
    expect(result.downloaded).toBe(1);
    expect(pegaClient.getRuleByInsKey).toHaveBeenCalledTimes(1);
    expect(ingestSpy).toHaveBeenCalledTimes(2);
  });

  it("TC-IT-11: derivation differs from actual path → manifest lookup wins (robust)", async () => {
    setConfig({});
    const cs = checksumOf(PZ_KEY, DATE, DATE);
    // Saved at a DIFFERENT name than derivation produces for the catalog item
    // (pyRuleName="" → derived name falls back to "Rule"); the manifest maps the
    // exact pzInsKey to the real file, so the lookup must still hit.
    const abs = seedLocalRule("ClaimCreate_v2", {
      pzInsKey: PZ_KEY, pxUpdateDateTime: DATE, pxSaveDateTime: DATE,
    });
    seedManifest({ [PZ_KEY]: toRelative(abs) });

    const result = await runTest([catalogItem(cs)]);

    expect(pegaClient.getRuleByInsKey).not.toHaveBeenCalled();
    expect(result.localServed).toBe(1);
    expect(result.downloaded).toBe(0);
  });

  it("TC-IT-12: ingest receives the 3-field computePegaChecksum from the local rule (INV-1)", async () => {
    setConfig({});
    seedLocalRule("ClaimCreate", {
      pzInsKey: PZ_KEY, pxObjClass: RULE_CLASS, pyRuleName: "ClaimCreate",
      pxUpdateDateTime: DATE, pxSaveDateTime: DATE,
    });
    seedManifest({ [PZ_KEY]: `rules/${RULE_CLASS}/ClaimCreate.pega.json` });
    const cs = computePegaChecksum({ pzInsKey: PZ_KEY, pxUpdateDateTime: DATE, pxSaveDateTime: DATE });

    await runTest([catalogItem(cs)]);

    expect(ingestSpy).toHaveBeenCalledTimes(1);
    const [projectId, ruleJson, checksum] = ingestSpy.mock.calls[0];
    expect(projectId).toBe(PROJECT_ID);
    expect(checksum).toBe(cs); // 3-field checksum (case-normalized match)
    expect(checksum).toMatch(/^[0-9a-f]{64}$/);
    // The ingested CONTENT is the local rule (no re-fetch).
    expect((ruleJson as Record<string, unknown>).pzInsKey).toBe(PZ_KEY);
  });
});
