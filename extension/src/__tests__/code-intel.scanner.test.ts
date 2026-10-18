/**
 * Extension tests for Code Intelligence module (SA4E-44 Phase 3) —
 * Task #27 CodeIntelScanner.
 * (Split from code-intel.test.ts — scanner concern.)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("vscode", () => ({
  workspace: {
    onDidSaveTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
    onDidCreateFiles: vi.fn(() => ({ dispose: vi.fn() })),
    onDidDeleteFiles: vi.fn(() => ({ dispose: vi.fn() })),
    getConfiguration: vi.fn(() => ({ get: vi.fn(() => true) })),
  },
  window: { createOutputChannel: vi.fn(() => ({ appendLine: vi.fn(), show: vi.fn() })) },
  Uri: { file: (p: string) => ({ fsPath: p }) },
}));

import { CodeIntelScanner } from "../code-intel/CodeIntelScanner";

// ─── Task #27: CodeIntelScanner ────────────────────────────────────────

describe("CodeIntelScanner", () => {
  let scanner: CodeIntelScanner;

  beforeEach(() => { scanner = new CodeIntelScanner(); });

  it("extracts function declarations", () => {
    const content = `export function greet(name: string): string { return name; }`;
    const result = scanner.scanFile("src/greet.ts", content);
    expect(result).not.toBeNull();
    expect(result!.symbols).toContainEqual(
      expect.objectContaining({ name: "greet", kind: "function" })
    );
  });

  it("extracts class declarations", () => {
    const content = `export class MyService { run(): void {} }`;
    const result = scanner.scanFile("src/service.ts", content);
    expect(result!.symbols).toContainEqual(
      expect.objectContaining({ name: "MyService", kind: "class" })
    );
  });

  it("extracts interface declarations", () => {
    const content = `export interface IRepo { find(id: string): void; }`;
    const result = scanner.scanFile("src/repo.ts", content);
    expect(result!.symbols).toContainEqual(
      expect.objectContaining({ name: "IRepo", kind: "interface" })
    );
  });

  it("extracts named imports", () => {
    const content = `import { foo, bar } from './utils';`;
    const result = scanner.scanFile("src/main.ts", content);
    expect(result!.imports).toContainEqual(
      expect.objectContaining({ source: "./utils", names: ["foo", "bar"], importType: "named" })
    );
  });

  it("extracts default imports", () => {
    const content = `import React from 'react';`;
    const result = scanner.scanFile("src/app.tsx", content);
    expect(result!.imports).toContainEqual(
      expect.objectContaining({ source: "react", names: ["React"], importType: "default" })
    );
  });

  it("extracts namespace imports", () => {
    const content = `import * as path from 'path';`;
    const result = scanner.scanFile("src/util.ts", content);
    expect(result!.imports).toContainEqual(
      expect.objectContaining({ source: "path", names: ["path"], importType: "namespace" })
    );
  });

  it("extracts exports", () => {
    const content = `export function helper() {}\nexport class Config {}`;
    const result = scanner.scanFile("src/lib.ts", content);
    expect(result!.exports).toContainEqual(
      expect.objectContaining({ name: "helper", kind: "function", isDefault: false })
    );
    expect(result!.exports).toContainEqual(
      expect.objectContaining({ name: "Config", kind: "class", isDefault: false })
    );
  });

  it("returns null for unsupported file extensions", () => {
    const result = scanner.scanFile("readme.md", "# Hello");
    expect(result).toBeNull();
  });

  it("includes hash in payload", () => {
    const content = `const x = 1;`;
    const result = scanner.scanFile("src/x.ts", content);
    expect(result!.hash).toHaveLength(64);
  });

  it("detects correct language from extension", () => {
    const tsResult = scanner.scanFile("app.ts", "const a = 1;");
    expect(tsResult!.language).toBe("typescript");
    const jsResult = scanner.scanFile("app.js", "const a = 1;");
    expect(jsResult!.language).toBe("javascript");
  });
});
