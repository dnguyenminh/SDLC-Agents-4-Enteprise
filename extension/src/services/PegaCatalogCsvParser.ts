/**
 * PegaCatalogCsvParser — Parse rulecatalog.csv into crawl items.
 * SA4E-241 (IC-A1): HEADER-NAME-BASED parsing (not fixed index) so appended
 * columns (pxUpdateDateTime, pxSaveDateTime, checksum) are read by name and a
 * changed column order/count never breaks parsing. Each row's checksum is
 * resolved via Cách B (extension computes; column only verifies — IC-A2/A3).
 * Rows are converted to RuleSetRuleSummary → CrawlPlanItem carrying the checksum,
 * feeding the existing fetch+ingest pipeline (PegaCrawlHelper / PegaBfsIndexer).
 */
import * as fs from "fs";
import * as readline from "readline";
import { catalogRowToSummary, summaryToCrawlItem } from "../models";
import type { RuleCatalogRow, CrawlPlanItem } from "../models";
import { resolveRowChecksum } from "./PegaCatalogChecksumResolver";

type LogFn = (msg: string) => void;

/** Parse result with counts for reporting (incl. checksum verify telemetry). */
export interface CatalogParseResult {
  items: CrawlPlanItem[];
  totalRows: number;
  skippedRows: number;
  /** SA4E-241: checksum verify counters (IC-A2/A3). */
  checksumVerified: number;
  checksumMismatch: number;
  checksumComputed: number;
}

/**
 * Stream-parse the catalog CSV into crawl items (memory-safe for large files).
 * The first line is the header; column positions are resolved by NAME.
 * @param csvPath - Absolute path to rulecatalog.csv
 * @param log - Logger
 */
export async function parseCatalogCsv(csvPath: string, log: LogFn): Promise<CatalogParseResult> {
  if (!fs.existsSync(csvPath)) { throw new Error(`Catalog CSV not found: ${csvPath}`); }

  const rl = readline.createInterface({
    input: fs.createReadStream(csvPath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  const acc: CatalogParseResult = {
    items: [], totalRows: 0, skippedRows: 0,
    checksumVerified: 0, checksumMismatch: 0, checksumComputed: 0,
  };
  let header: Map<string, number> | null = null;

  for await (const line of rl) {
    if (header === null) { header = indexHeader(line); continue; }
    if (!line.trim()) { continue; }
    acc.totalRows++;
    ingestLine(line, header, acc, log);
  }

  log(`[Catalog] 🧾 Parsed ${acc.items.length} rules (${acc.skippedRows} skipped of ${acc.totalRows}); ` +
    `checksum: ${acc.checksumVerified} verified, ${acc.checksumMismatch} mismatch(E-03), ${acc.checksumComputed} computed(E-02)`);
  return acc;
}

/** Build a case-insensitive header-name → column-index map (IC-A1). */
function indexHeader(line: string): Map<string, number> {
  const map = new Map<string, number>();
  splitCsvLine(line).forEach((name, i) => map.set(name.trim().toLowerCase(), i));
  return map;
}

/** Parse one data line, resolve its checksum, and push a crawl item (or skip). */
function ingestLine(line: string, header: Map<string, number>, acc: CatalogParseResult, log: LogFn): void {
  const row = rowFromLine(line, header);
  if (!row) { acc.skippedRows++; return; }
  const res = resolveRowChecksum(row, log);
  if (res.outcome === "verified") { acc.checksumVerified++; }
  else if (res.outcome === "recomputed-mismatch") { acc.checksumMismatch++; }
  else { acc.checksumComputed++; }
  const summary = catalogRowToSummary({ ...row, checksum: res.checksum });
  acc.items.push(summaryToCrawlItem(summary));
}

/**
 * Build a RuleCatalogRow from a CSV line using the header map.
 * Returns null when required fields (pzInsKey, pxObjClass) are absent.
 */
function rowFromLine(line: string, header: Map<string, number>): RuleCatalogRow | null {
  const cols = splitCsvLine(line);
  const at = (name: string): string => {
    const i = header.get(name);
    return i === undefined ? "" : (cols[i] ?? "").trim();
  };
  const pzInsKey = at("pzinskey");
  const pxObjClass = at("pxobjclass");
  if (!pzInsKey || !pxObjClass) { return null; }
  return {
    pzInsKey, pxObjClass,
    pyClassName: at("pyclassname"),
    pyRuleSet: at("pyruleset"),
    pyRuleSetVersion: at("pyrulesetversion"),
    pyLabel: at("pylabel") || undefined,
    pxUpdateDateTime: at("pxupdatedatetime") || undefined,
    pxSaveDateTime: at("pxsavedatetime") || undefined,
    checksum: at("checksum") || undefined,
  };
}

/**
 * Split a CSV line into fields, honoring RFC-4180 double-quoted values
 * (commas and escaped "" inside quotes are preserved).
 */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } // escaped quote
        else { inQuotes = false; }
      } else { cur += ch; }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur); cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}
