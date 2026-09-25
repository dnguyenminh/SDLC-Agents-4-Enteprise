/**
 * SA4E-241 — Source A wiring tests: header-based parsing (IC-A1) + Cách B
 * checksum verify (IC-A2 match / E-03 mismatch / IC-A3 E-02 missing).
 * The parser must read appended columns by NAME and carry a checksum onto items.
 */
import { describe, it, expect, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { parseCatalogCsv } from "../PegaCatalogCsvParser";
import { resolveRowChecksum } from "../PegaCatalogChecksumResolver";
import { computePegaChecksum } from "../../code-intel/checksum/PegaRuleChecksumStrategy";
import type { RuleCatalogRow } from "../../models";

const tmp: string[] = [];
function writeCsv(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "catcs-"));
  const p = path.join(dir, "rulecatalog.csv");
  fs.writeFileSync(p, content, "utf-8");
  tmp.push(p);
  return p;
}
const noop = (_: string) => {};
afterEach(() => { for (const f of tmp.splice(0)) { try { fs.rmSync(path.dirname(f), { recursive: true, force: true }); } catch { /* ignore */ } } });

const baseRow = (over: Partial<RuleCatalogRow> = {}): RuleCatalogRow => ({
  pzInsKey: "RULE-A", pxObjClass: "Rule-Obj-Activity", pyClassName: "A",
  pyRuleSet: "RS", pyRuleSetVersion: "01-01-01",
  pxUpdateDateTime: "20260430T101500.000 GMT", pxSaveDateTime: "20260430T101500.000 GMT",
  ...over,
});

describe("resolveRowChecksum — Cách B (IC-A2/A3, E-02/E-03)", () => {
  it("IC-A2: column present + matches → verified, returns computed", () => {
    const row = baseRow();
    const expected = computePegaChecksum(row);
    const res = resolveRowChecksum({ ...row, checksum: expected }, noop);
    expect(res.outcome).toBe("verified");
    expect(res.checksum).toBe(expected);
  });

  it("E-03: column present + mismatches → recomputed-mismatch, returns COMPUTED (not column)", () => {
    const row = baseRow();
    const bogus = "f".repeat(64);
    const res = resolveRowChecksum({ ...row, checksum: bogus }, noop);
    expect(res.outcome).toBe("recomputed-mismatch");
    expect(res.checksum).toBe(computePegaChecksum(row));
    expect(res.checksum).not.toBe(bogus);
  });

  it("E-02: column absent → computed-missing, computes from 3 fields", () => {
    const row = baseRow({ checksum: undefined });
    const res = resolveRowChecksum(row, noop);
    expect(res.outcome).toBe("computed-missing");
    expect(res.checksum).toBe(computePegaChecksum(row));
  });

  it("E-02: malformed column (not 64-hex) → computed-missing", () => {
    const res = resolveRowChecksum(baseRow({ checksum: "NOT-HEX" }), noop);
    expect(res.outcome).toBe("computed-missing");
  });
});

describe("parseCatalogCsv — header-based, appended columns (IC-A1)", () => {
  it("reads pxUpdateDateTime/pxSaveDateTime/checksum by NAME even when appended at the end", async () => {
    const header = "pzInsKey,pxObjClass,pyClassName,pyRuleSet,pyRuleSetVersion,pyLabel,pxUpdateDateTime,pxSaveDateTime,checksum";
    const row = baseRow();
    const good = computePegaChecksum(row);
    const line = `RULE-A,Rule-Obj-Activity,A,RS,01-01-01,Lbl,${row.pxUpdateDateTime},${row.pxSaveDateTime},${good}`;
    const res = await parseCatalogCsv(writeCsv([header, line].join("\n")), noop);
    expect(res.items.length).toBe(1);
    expect(res.items[0].checksum).toBe(good);
    expect(res.checksumVerified).toBe(1);
  });

  it("IC-A1: reordered header still maps correctly (checksum first column)", async () => {
    const row = baseRow();
    const good = computePegaChecksum(row);
    const header = "checksum,pxSaveDateTime,pxUpdateDateTime,pyClassName,pxObjClass,pzInsKey";
    const line = `${good},${row.pxSaveDateTime},${row.pxUpdateDateTime},A,Rule-Obj-Activity,RULE-A`;
    const res = await parseCatalogCsv(writeCsv([header, line].join("\n")), noop);
    expect(res.items.length).toBe(1);
    expect(res.items[0].insKey).toBe("RULE-A");
    expect(res.items[0].checksum).toBe(good);
  });

  it("IC-A3: missing checksum column → extension computes (no crash), counts E-02", async () => {
    const row = baseRow();
    const header = "pzInsKey,pxObjClass,pyClassName,pxUpdateDateTime,pxSaveDateTime";
    const line = `RULE-A,Rule-Obj-Activity,A,${row.pxUpdateDateTime},${row.pxSaveDateTime}`;
    const res = await parseCatalogCsv(writeCsv([header, line].join("\n")), noop);
    expect(res.items[0].checksum).toBe(computePegaChecksum(row));
    expect(res.checksumComputed).toBe(1);
  });
});
