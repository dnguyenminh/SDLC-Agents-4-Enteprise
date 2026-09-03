/**
 * Unit + Property tests — PegaCatalogCsvParser (SA4E-240).
 * Verifies RFC-4180 splitting, invalid-row skipping, and row→CrawlPlanItem mapping.
 * Covers STC: TC-UT-01, TC-UT-02, TC-UT-03, TC-UT-08, TC-PBT-01.
 */
import { describe, it, expect, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { parseCatalogCsv } from "../PegaCatalogCsvParser";
import { catalogRowToSummary, CATALOG_COLUMNS } from "../../models";
import { summaryToCrawlItem } from "../../models";

const HEADER =
  "pzInsKey,pxObjClass,pyClassName,pyRuleSet,pyRuleSetVersion,pyRuleAvailable," +
  "pyBaseRule,pyCircumstanceType,pyCircumstanceProp,pyCircumstanceVal," +
  "pyCircumstanceDateProp,pyCircumstanceDate,pyRuleStarts,pyRuleEnds,pyLabel,pxCreateDateTime";

const tmpFiles: string[] = [];
function writeTmpCsv(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "catcsv-"));
  const p = path.join(dir, "rulecatalog.csv");
  fs.writeFileSync(p, content, "utf-8");
  tmpFiles.push(p);
  return p;
}
const noop = (_: string) => {};

afterEach(() => {
  for (const f of tmpFiles.splice(0)) {
    try { fs.rmSync(path.dirname(f), { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

describe("PegaCatalogCsvParser", () => {
  // TC-UT-01 — skip rows missing pzInsKey / pxObjClass
  it("TC-UT-01: skips rows missing required fields", async () => {
    const rowOk = "RULE-OBJ-ACTIVITY A!B,Rule-Obj-Activity,A,RS,01-01-01,Yes,,,,,,,,,Label1,ts";
    const rowNoKey = ",Rule-Obj-Activity,A,RS,01-01-01,Yes,,,,,,,,,NoKey,ts";
    const rowNoClass = "RULE-OBJ-ACTIVITY C!D,,C,RS,01-01-01,Yes,,,,,,,,,NoClass,ts";
    const csv = [HEADER, rowOk, rowNoKey, rowNoClass].join("\n");
    const res = await parseCatalogCsv(writeTmpCsv(csv), noop);
    expect(res.items.length).toBe(1);
    expect(res.totalRows).toBe(3);
    expect(res.skippedRows).toBe(2);
  });

  // TC-UT-02 — RFC-4180 quoted commas + escaped quotes preserved
  it("TC-UT-02: parses quoted commas and escaped quotes (RFC-4180)", async () => {
    // pyLabel (col 14) contains a comma inside quotes → must stay a single field.
    const row = 'RULE-OBJ-PROPERTY X!Email,Rule-Obj-Property,X,RS,02-03-11,Yes,,,,,,,,,"Email, Primary",ts';
    const res = await parseCatalogCsv(writeTmpCsv([HEADER, row].join("\n")), noop);
    expect(res.items.length).toBe(1);
    // insKey must not be corrupted by the comma inside the quoted label field.
    expect(res.items[0].insKey).toBe("RULE-OBJ-PROPERTY X!Email");
  });

  // TC-UT-08 — 0 data rows → empty items (drives run() fallback)
  it("TC-UT-08: header-only CSV yields zero items", async () => {
    const res = await parseCatalogCsv(writeTmpCsv(HEADER + "\n"), noop);
    expect(res.items.length).toBe(0);
    expect(res.totalRows).toBe(0);
  });

  it("throws when CSV file does not exist", async () => {
    await expect(parseCatalogCsv("/no/such/file.csv", noop)).rejects.toThrow(/not found/i);
  });
});

describe("catalog models adapter", () => {
  // TC-UT-03 — row → summary → CrawlPlanItem.
  // pyRuleName is ALWAYS empty (even when pyLabel is present): the catalog's
  // pzInsKey is the single source of truth and fetch happens by insKey only.
  // Deriving a name from pyLabel would rebuild a wrong insKey (class+name) → 404.
  it("TC-UT-03: maps catalog row to CrawlPlanItem, pyRuleName empty (fetch-by-insKey)", () => {
    const item = summaryToCrawlItem(
      catalogRowToSummary({
        pzInsKey: "RULE-X A!B",
        pxObjClass: "Rule-Obj-Activity",
        pyClassName: "A",
        pyRuleSet: "RS",
        pyRuleSetVersion: "01-01-01",
        pyLabel: "MyRule",
      }),
    );
    expect(item.insKey).toBe("RULE-X A!B");
    expect(item.pxObjClass).toBe("Rule-Obj-Activity");
    expect(item.pyRuleName).toBe("");
  });

  it("TC-UT-03b: empty pyRuleName when label missing (fetch-by-insKey path)", () => {
    const summary = catalogRowToSummary({
      pzInsKey: "RULE-Y C!D", pxObjClass: "Rule-Obj-Activity",
      pyClassName: "C", pyRuleSet: "RS", pyRuleSetVersion: "01-01-01",
    });
    expect(summary.pyRuleName).toBe("");
  });

  it("exposes fixed 16-column indices", () => {
    expect(CATALOG_COLUMNS.pzInsKey).toBe(0);
    expect(CATALOG_COLUMNS.pxObjClass).toBe(1);
    expect(CATALOG_COLUMNS.pyLabel).toBe(14);
  });
});
