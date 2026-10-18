/**
 * Reference-implementation double for indexer.ts discoverDocuments tests
 * (STC: UT-010..016, IT-009..012). Extracted from indexer.test.ts so the
 * test file stays ≤200 lines.
 */
import * as fs from "fs";
import * as path from "path";

export const INDEXABLE_EXTENSIONS = new Set([
  ".md", ".docx", ".doc", ".xlsx", ".xls", ".pptx", ".ppt",
  ".pdf", ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".svg",
  ".txt", ".csv", ".json", ".xml", ".yaml", ".yml",
  ".rtf", ".odt", ".ods", ".odp",
]);

export const DOCUMENT_TYPES: Record<string, string> = {
  "BRD": "REQUIREMENT", "FSD": "REQUIREMENT", "TDD": "ARCHITECTURE",
  "STP": "PROCEDURE", "STC": "PROCEDURE", "DPG": "PROCEDURE",
  "RLN": "PROCEDURE", "UG": "PROCEDURE", "TEST-REPORT": "PROCEDURE",
  "DISCREPANCY": "CONTEXT", "SECURITY-REPORT": "PROCEDURE",
};

export const FOLDER_DENYLIST = new Set(["diagrams", "testdata", "templates", "node_modules", ".git"]);

export function discoverDocumentsTest(root: string) {
  const docsDir = path.join(root, "documents");
  if (!fs.existsSync(docsDir)) { return []; }
  const results: Array<{ path: string; type: string; ticket: string; format: string }> = [];
  scanRecursive(docsDir, "documents", "documents", results);
  return results;
}

function scanRecursive(dir: string, ticket: string, relativePath: string, results: Array<{ path: string; type: string; ticket: string; format: string }>) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (FOLDER_DENYLIST.has(entry.name)) { continue; }
      const childTicket = ticket === "documents" ? entry.name : ticket;
      scanRecursive(path.join(dir, entry.name), childTicket, `${relativePath}/${entry.name}`, results);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (!INDEXABLE_EXTENSIONS.has(ext)) { continue; }
      const baseName = path.basename(entry.name, ext).toUpperCase();
      let docType = "CONTEXT";
      for (const key of Object.keys(DOCUMENT_TYPES)) {
        if (baseName === key || baseName.startsWith(key + "-") || baseName.startsWith(key + "_") || baseName.startsWith(key)) {
          docType = DOCUMENT_TYPES[key];
          break;
        }
      }
      const format = ext === ".md" ? "markdown" : ext.replace(".", "");
      results.push({ path: `${relativePath}/${entry.name}`, type: docType, ticket, format });
    }
  }
}
