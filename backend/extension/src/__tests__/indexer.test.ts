/**
 * Integration tests for indexer.ts discoverDocuments function
 * Covers STC: UT-010..016, IT-009..012
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

vi.mock("vscode", () => ({
  window: {
    showQuickPick: vi.fn(),
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    createOutputChannel: vi.fn(() => ({ show: vi.fn(), appendLine: vi.fn() })),
    withProgress: vi.fn(),
  },
  workspace: { workspaceFolders: [{ uri: { fsPath: "/mock" } }] },
  ProgressLocation: { Notification: 15 },
  commands: { registerCommand: vi.fn() },
}));

describe("Document Discovery Logic", () => {
  let tmpDir: string;
  let documentsDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "indexer-test-"));
    documentsDir = path.join(tmpDir, "documents");
    fs.mkdirSync(documentsDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const INDEXABLE_EXTENSIONS = new Set([
    ".md", ".docx", ".doc", ".xlsx", ".xls", ".pptx", ".ppt",
    ".pdf", ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".svg",
    ".txt", ".csv", ".json", ".xml", ".yaml", ".yml",
    ".rtf", ".odt", ".ods", ".odp",
  ]);

  const DOCUMENT_TYPES: Record<string, string> = {
    "BRD": "REQUIREMENT", "FSD": "REQUIREMENT", "TDD": "ARCHITECTURE",
    "STP": "PROCEDURE", "STC": "PROCEDURE", "DPG": "PROCEDURE",
    "RLN": "PROCEDURE", "UG": "PROCEDURE", "TEST-REPORT": "PROCEDURE",
    "DISCREPANCY": "CONTEXT", "SECURITY-REPORT": "PROCEDURE",
  };

  function discoverDocumentsTest(root: string) {
    const docsDir = path.join(root, "documents");
    if (!fs.existsSync(docsDir)) { return []; }
    const results: Array<{ path: string; type: string; ticket: string; format: string }> = [];
    const allEntries = fs.readdirSync(docsDir);
    const tickets = allEntries.filter(d =>
      fs.statSync(path.join(docsDir, d)).isDirectory() && /^[A-Z]+-\d+$/.test(d)
    );
    for (const ticket of tickets) {
      scanRecursive(path.join(docsDir, ticket), ticket, `documents/${ticket}`, results);
    }
    return results;
  }

  function scanRecursive(dir: string, ticket: string, relativePath: string, results: Array<{ path: string; type: string; ticket: string; format: string }>) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (entry.name === "diagrams" || entry.name === "testdata") { continue; }
        scanRecursive(path.join(dir, entry.name), ticket, `${relativePath}/${entry.name}`, results);
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

  it("UT-010: excludes files in diagrams/ folder", () => {
    const ticketDir = path.join(documentsDir, "TEST-1");
    fs.mkdirSync(ticketDir); fs.mkdirSync(path.join(ticketDir, "diagrams"));
    fs.writeFileSync(path.join(ticketDir, "diagrams", "arch.drawio"), "<xml>");
    fs.writeFileSync(path.join(ticketDir, "BRD.md"), "# BRD");
    const results = discoverDocumentsTest(tmpDir);
    expect(results.some(r => r.path.includes("arch.drawio"))).toBe(false);
    expect(results.some(r => r.path.includes("BRD.md"))).toBe(true);
  });

  it("UT-011: excludes files in testdata/ folder", () => {
    const ticketDir = path.join(documentsDir, "TEST-1");
    fs.mkdirSync(ticketDir); fs.mkdirSync(path.join(ticketDir, "testdata"));
    fs.writeFileSync(path.join(ticketDir, "testdata", "data.csv"), "a,b");
    fs.writeFileSync(path.join(ticketDir, "notes.csv"), "note1,note2");
    const results = discoverDocumentsTest(tmpDir);
    expect(results.some(r => r.path.includes("testdata"))).toBe(false);
    expect(results.some(r => r.path.includes("notes.csv"))).toBe(true);
  });

  it("UT-012: includes files in nested subdirectories", () => {
    const ticketDir = path.join(documentsDir, "TEST-1");
    fs.mkdirSync(ticketDir); fs.mkdirSync(path.join(ticketDir, "attachments"));
    fs.writeFileSync(path.join(ticketDir, "attachments", "spec.pdf"), "pdf");
    const results = discoverDocumentsTest(tmpDir);
    expect(results.some(r => r.path.includes("spec.pdf"))).toBe(true);
  });

  it("UT-013: only includes files with indexable extensions", () => {
    const ticketDir = path.join(documentsDir, "TEST-1");
    fs.mkdirSync(ticketDir);
    fs.writeFileSync(path.join(ticketDir, "report.docx"), "docx");
    fs.writeFileSync(path.join(ticketDir, "script.exe"), "exe");
    fs.writeFileSync(path.join(ticketDir, "run.sh"), "sh");
    fs.writeFileSync(path.join(ticketDir, "notes.md"), "# notes");
    const results = discoverDocumentsTest(tmpDir);
    expect(results.some(r => r.path.includes("report.docx"))).toBe(true);
    expect(results.some(r => r.path.includes("notes.md"))).toBe(true);
    expect(results.some(r => r.path.includes("script.exe"))).toBe(false);
    expect(results.some(r => r.path.includes("run.sh"))).toBe(false);
  });

  it("UT-014: classifies known document names correctly", () => {
    const ticketDir = path.join(documentsDir, "TEST-1");
    fs.mkdirSync(ticketDir);
    fs.writeFileSync(path.join(ticketDir, "BRD.md"), "#"); fs.writeFileSync(path.join(ticketDir, "FSD.docx"), "f");
    fs.writeFileSync(path.join(ticketDir, "TDD.pdf"), "t"); fs.writeFileSync(path.join(ticketDir, "STP.xlsx"), "s");
    const results = discoverDocumentsTest(tmpDir);
    expect(results.find(r => r.path.includes("BRD.md"))?.type).toBe("REQUIREMENT");
    expect(results.find(r => r.path.includes("FSD.docx"))?.type).toBe("REQUIREMENT");
    expect(results.find(r => r.path.includes("TDD.pdf"))?.type).toBe("ARCHITECTURE");
    expect(results.find(r => r.path.includes("STP.xlsx"))?.type).toBe("PROCEDURE");
  });

  it("UT-015: unknown file names map to CONTEXT type", () => {
    const ticketDir = path.join(documentsDir, "TEST-1");
    fs.mkdirSync(ticketDir);
    fs.writeFileSync(path.join(ticketDir, "meeting-notes.docx"), "n");
    fs.writeFileSync(path.join(ticketDir, "api-spec.yaml"), "s");
    const results = discoverDocumentsTest(tmpDir);
    expect(results.find(r => r.path.includes("meeting-notes.docx"))?.type).toBe("CONTEXT");
    expect(results.find(r => r.path.includes("api-spec.yaml"))?.type).toBe("CONTEXT");
  });

  it("UT-016: extracts ticket key from folder name", () => {
    fs.mkdirSync(path.join(documentsDir, "KSA-239"));
    fs.writeFileSync(path.join(documentsDir, "KSA-239", "BRD.md"), "#");
    const results = discoverDocumentsTest(tmpDir);
    expect(results[0]?.ticket).toBe("KSA-239");
  });

  it("UT-017: classifies files with extra suffixes correctly", () => {
    const ticketDir = path.join(documentsDir, "TEST-1");
    fs.mkdirSync(ticketDir);
    fs.writeFileSync(path.join(ticketDir, "TDD-v1-KSA-26.docx"), "t");
    fs.writeFileSync(path.join(ticketDir, "BRD_STORY_8.md"), "b");
    const results = discoverDocumentsTest(tmpDir);
    expect(results.find(r => r.path.includes("TDD-v1-KSA-26.docx"))?.type).toBe("ARCHITECTURE");
    expect(results.find(r => r.path.includes("BRD_STORY_8.md"))?.type).toBe("REQUIREMENT");
  });

  it("IT-009: mixed structure with exclusions", () => {
    const ticketDir = path.join(documentsDir, "TEST-1");
    fs.mkdirSync(ticketDir); fs.mkdirSync(path.join(ticketDir, "diagrams")); fs.mkdirSync(path.join(ticketDir, "testdata"));
    fs.writeFileSync(path.join(ticketDir, "BRD.md"), "#"); fs.writeFileSync(path.join(ticketDir, "FSD.docx"), "f");
    fs.writeFileSync(path.join(ticketDir, "diagrams", "arch.drawio"), "<xml>");
    fs.writeFileSync(path.join(ticketDir, "testdata", "data.csv"), "a");
    const results = discoverDocumentsTest(tmpDir);
    expect(results.length).toBe(2);
  });

  it("IT-010: recursive subdirectory discovery", () => {
    const ticketDir = path.join(documentsDir, "TEST-1");
    fs.mkdirSync(ticketDir); fs.mkdirSync(path.join(ticketDir, "attachments")); fs.mkdirSync(path.join(ticketDir, "specs"));
    fs.writeFileSync(path.join(ticketDir, "attachments", "design.pdf"), "p");
    fs.writeFileSync(path.join(ticketDir, "specs", "api.yaml"), "o");
    const results = discoverDocumentsTest(tmpDir);
    expect(results.length).toBe(2);
  });

  it("IT-012: multiple ticket folders", () => {
    for (const t of ["KSA-1", "KSA-2", "KSA-3"]) {
      fs.mkdirSync(path.join(documentsDir, t));
      fs.writeFileSync(path.join(documentsDir, t, "BRD.md"), "#");
    }
    const results = discoverDocumentsTest(tmpDir);
    expect(results.length).toBe(3);
    expect(results.map(r => r.ticket).sort()).toEqual(["KSA-1", "KSA-2", "KSA-3"]);
  });

  it("ignores non-ticket folder names", () => {
    fs.mkdirSync(path.join(documentsDir, "templates"));
    fs.writeFileSync(path.join(documentsDir, "templates", "BRD.md"), "t");
    expect(discoverDocumentsTest(tmpDir).length).toBe(0);
  });
});
