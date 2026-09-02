/**
 * PegaCatalogCsvParser — Parse rulecatalog.csv into crawl items.
 * The catalog is a 16-column CSV (one rule per row, metadata only). Rows are
 * converted to RuleSetRuleSummary → CrawlPlanItem so they feed the existing
 * fetch+ingest pipeline (PegaCrawlHelper / PegaBfsIndexer).
 */
import * as fs from "fs";
import * as readline from "readline";
import { CATALOG_COLUMNS, catalogRowToSummary, summaryToCrawlItem } from "../models";
import type { RuleCatalogRow, CrawlPlanItem } from "../models";

type LogFn = (msg: string) => void;

/** Parse result with counts for reporting. */
export interface CatalogParseResult {
  items: CrawlPlanItem[];
  totalRows: number;
  skippedRows: number;
}

/**
 * Stream-parse the catalog CSV into crawl items (memory-safe for large files).
 * Skips the header row and any row missing pzInsKey/pxObjClass.
 * @param csvPath - Absolute path to rulecatalog.csv
 * @param log - Logger
 */
export async function parseCatalogCsv(csvPath: string, log: LogFn): Promise<CatalogParseResult> {
  if (!fs.existsSync(csvPath)) { throw new Error(`Catalog CSV not found: ${csvPath}`); }

  const items: CrawlPlanItem[] = [];
  let totalRows = 0;
  let skippedRows = 0;
  let isHeader = true;

  const rl = readline.createInterface({
    input: fs.createReadStream(csvPath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (isHeader) { isHeader = false; continue; } // skip 16-column header
    if (!line.trim()) { continue; }
    totalRows++;
    const row = rowFromLine(line);
    if (!row) { skippedRows++; continue; }
    items.push(summaryToCrawlItem(catalogRowToSummary(row)));
  }

  log(`[Catalog] 🧾 Parsed ${items.length} rules from catalog (${skippedRows} skipped of ${totalRows})`);
  return { items, totalRows, skippedRows };
}

/**
 * Build a RuleCatalogRow from a single CSV line.
 * Returns null when required fields (pzInsKey, pxObjClass) are absent.
 */
function rowFromLine(line: string): RuleCatalogRow | null {
  const cols = splitCsvLine(line);
  const pzInsKey = (cols[CATALOG_COLUMNS.pzInsKey] || "").trim();
  const pxObjClass = (cols[CATALOG_COLUMNS.pxObjClass] || "").trim();
  if (!pzInsKey || !pxObjClass) { return null; }
  return {
    pzInsKey,
    pxObjClass,
    pyClassName: (cols[CATALOG_COLUMNS.pyClassName] || "").trim(),
    pyRuleSet: (cols[CATALOG_COLUMNS.pyRuleSet] || "").trim(),
    pyRuleSetVersion: (cols[CATALOG_COLUMNS.pyRuleSetVersion] || "").trim(),
    pyLabel: (cols[CATALOG_COLUMNS.pyLabel] || "").trim() || undefined,
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
