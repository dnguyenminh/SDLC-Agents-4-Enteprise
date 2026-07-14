/**
 * Document discovery logic for workspace indexing.
 * Extracted from indexer.ts.
 */
import * as fs from "fs";
import * as path from "path";

const DOCUMENT_TYPES: Record<string, string> = {
  "BRD": "REQUIREMENT", "FSD": "REQUIREMENT", "TDD": "ARCHITECTURE",
  "STP": "PROCEDURE", "STC": "PROCEDURE", "DPG": "PROCEDURE",
  "RLN": "PROCEDURE", "UG": "PROCEDURE", "TEST-REPORT": "PROCEDURE",
  "DISCREPANCY": "CONTEXT", "SECURITY-REPORT": "PROCEDURE"
};

const INDEXABLE_EXTENSIONS = new Set([
  ".md", ".docx", ".doc", ".xlsx", ".xls", ".pptx", ".ppt",
  ".pdf", ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".svg",
  ".txt", ".csv", ".json", ".xml", ".yaml", ".yml", ".rtf", ".odt", ".ods", ".odp"
]);

// Folders under documents/ that never contain indexable documents.
// Everything else (any project/feature/ticket folder name) is scanned.
const FOLDER_DENYLIST = new Set(["diagrams", "testdata", "templates", "node_modules", ".git"]);

export function discoverDocuments(root: string): Array<{ path: string; type: string; ticket: string; format: string }> {
  const docsDir = path.join(root, "documents");
  if (!fs.existsSync(docsDir)) { return []; }
  const results: Array<{ path: string; type: string; ticket: string; format: string }> = [];
  // Scan the whole documents/ tree. Folder names are NOT constrained to a
  // ticket-key pattern — any subfolder (e.g. "GRAPH-EMAIL") is a valid group.
  scanDirectoryRecursive(docsDir, "documents", "documents", results);
  return results;
}

function scanDirectoryRecursive(
  dir: string, ticket: string, relativePath: string,
  results: Array<{ path: string; type: string; ticket: string; format: string }>
): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (FOLDER_DENYLIST.has(entry.name)) { continue; }
      // At the documents/ root, each subfolder name becomes the group/ticket label.
      const childTicket = ticket === "documents" ? entry.name : ticket;
      scanDirectoryRecursive(path.join(dir, entry.name), childTicket, `${relativePath}/${entry.name}`, results);
    } else if (entry.isFile()) {
      const classified = classifyFile(entry.name);
      if (!classified) { continue; }
      results.push({ path: `${relativePath}/${entry.name}`, type: classified.type, ticket, format: classified.format });
    }
  }
}

function classifyFile(fileName: string): { type: string; format: string } | null {
  const ext = path.extname(fileName).toLowerCase();
  if (!INDEXABLE_EXTENSIONS.has(ext)) { return null; }
  const baseName = path.basename(fileName, ext).toUpperCase();
  let docType = "CONTEXT";
  for (const key of Object.keys(DOCUMENT_TYPES)) {
    if (baseName === key || baseName.startsWith(key + "-") || baseName.startsWith(key + "_") || baseName.startsWith(key)) {
      docType = DOCUMENT_TYPES[key]; break;
    }
  }
  const format = ext === ".md" ? "markdown" : ext.replace(".", "");
  return { type: docType, format };
}

export function formatDocList(docs: Array<{ path: string; type: string; ticket: string }>): string {
  const byTicket = new Map<string, string[]>();
  for (const doc of docs) {
    const list = byTicket.get(doc.ticket) || [];
    list.push(`${path.basename(doc.path, ".md")} (${doc.type})`);
    byTicket.set(doc.ticket, list);
  }
  const lines: string[] = [];
  for (const [ticket, files] of byTicket) { lines.push(`  ${ticket}: ${files.join(", ")}`); }
  return lines.join("\n");
}

export function resolveViewerPort(root: string): number {
  try {
    const mcpPath = path.join(root, ".kiro", "settings", "mcp.json");
    if (fs.existsSync(mcpPath)) {
      const raw = fs.readFileSync(mcpPath, "utf-8");
      const config = JSON.parse(raw);
      const servers = config.mcpServers || {};
      for (const [name, server] of Object.entries(servers) as [string, any][]) {
        if (server.disabled) { continue; }
        if (name.includes("code-intel") && server.url) {
          const match = server.url.match(/:(\d+)/);
          if (match) { return parseInt(match[1], 10); }
        }
      }
      for (const server of Object.values(servers) as any[]) {
        if (server.disabled) { continue; }
        const env = server.env || {};
        if (env.CODE_INTEL_VIEWER_PORT) { return parseInt(env.CODE_INTEL_VIEWER_PORT, 10); }
      }
    }
  } catch { /* ignore */ }
  return 3200;
}
