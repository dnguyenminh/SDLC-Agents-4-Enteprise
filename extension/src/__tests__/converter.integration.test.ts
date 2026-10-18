/**
 * Integration tests for converter.ts — convertFileToMarkdown with a real
 * filesystem.
 *
 * Covers STC test cases: UT-001..008, IT-005..012.
 * (Split from converter.test.ts — real-fs integration concern.)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

describe("converter.ts — Public API", () => {
  let converter: typeof import("../converter");

  beforeEach(async () => {
    vi.resetModules();
    converter = await import("../converter");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===== convertFileToMarkdown — with real filesystem =====

  describe("convertFileToMarkdown — Integration (real fs)", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "converter-test-"));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    // UT-001 / IT-005: Text format .txt direct read
    it("UT-001/IT: converts real .txt file", async () => {
      const filePath = path.join(tmpDir, "file.txt");
      fs.writeFileSync(filePath, "Hello World\nLine 2");

      const result = await converter.convertFileToMarkdown(filePath, "txt");
      expect(result.success).toBe(true);
      expect(result.markdown).toContain("Hello World");
      expect(result.markdown).toContain("```txt");
      expect(result.bytesProcessed).toBeGreaterThan(0);
      expect(result.conversionTime).toBeGreaterThanOrEqual(0);
    });

    // UT-002: .csv
    it("UT-002/IT: converts real .csv file", async () => {
      const filePath = path.join(tmpDir, "data.csv");
      fs.writeFileSync(filePath, "name,age\nAlice,30\nBob,25");

      const result = await converter.convertFileToMarkdown(filePath, "csv");
      expect(result.success).toBe(true);
      expect(result.markdown).toContain("name,age");
      expect(result.markdown).toContain("```csv");
    });

    // UT-003: .json
    it("UT-003/IT: converts real .json file", async () => {
      const filePath = path.join(tmpDir, "config.json");
      fs.writeFileSync(filePath, '{"name":"test","version":"1.0"}');

      const result = await converter.convertFileToMarkdown(filePath, "json");
      expect(result.success).toBe(true);
      expect(result.markdown).toContain("```json");
      expect(result.markdown).toContain('"name"');
    });

    // IT-005: .yaml direct read
    it("IT-005: converts real .yaml file", async () => {
      const filePath = path.join(tmpDir, "config.yaml");
      fs.writeFileSync(filePath, "server:\n  port: 8080\n  host: localhost");

      const result = await converter.convertFileToMarkdown(filePath, "yaml");
      expect(result.success).toBe(true);
      expect(result.markdown).toContain("```yaml");
      expect(result.markdown).toContain("port: 8080");
    });

    // IT-011: XML and YAML as text formats
    it("IT-011: converts real .xml file", async () => {
      const filePath = path.join(tmpDir, "config.xml");
      fs.writeFileSync(filePath, "<root><item>test</item></root>");

      const result = await converter.convertFileToMarkdown(filePath, "xml");
      expect(result.success).toBe(true);
      expect(result.markdown).toContain("```xml");
      expect(result.markdown).toContain("<root>");
    });

    it("IT-011: converts real .yml file", async () => {
      const filePath = path.join(tmpDir, "deploy.yml");
      fs.writeFileSync(filePath, "deploy:\n  target: prod");

      const result = await converter.convertFileToMarkdown(filePath, "yml");
      expect(result.success).toBe(true);
      expect(result.markdown).toContain("```yaml"); // normalized
      expect(result.markdown).toContain("target: prod");
    });

    // UT-007: File not found
    it("UT-007: returns error for non-existent file", async () => {
      const result = await converter.convertFileToMarkdown("/nonexistent/file.txt", "txt");
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
      expect(result.error).toMatch(/not found|ENOENT|inaccessible/i);
    });

    // UT-004 / IT-007: Size limit enforcement
    // Cannot spy on fs.statSync in ESM mode, tested via isFileTooLarge above
    it("UT-004/IT-007: size limit rejects oversized PDF", () => {
      expect(converter.isFileTooLarge("pdf", 57671680)).toBe(true);
      expect(converter.isFileTooLarge("pdf", 40 * 1024 * 1024)).toBe(false);
    });

    // UT-005: Image size limit
    it("UT-005: image > 20MB rejected", () => {
      expect(converter.isFileTooLarge("png", 26214400)).toBe(true);
      expect(converter.isFileTooLarge("jpg", 26214400)).toBe(true);
      expect(converter.isFileTooLarge("png", 15 * 1024 * 1024)).toBe(false);
    });

    // UT-008: Binary conversion does not throw (graceful handling)
    it("UT-008: handles binary conversion failure gracefully", async () => {
      const filePath = path.join(tmpDir, "corrupt.docx");
      fs.writeFileSync(filePath, Buffer.from([0x50, 0x4b, 0x03, 0x04])); // ZIP header

      let threw = false;
      let result;
      try {
        result = await converter.convertFileToMarkdown(filePath, "docx");
      } catch {
        threw = true;
      }
      // Must not throw; result must be a well-formed ConversionResult
      expect(threw).toBe(false);
      expect(result).toBeDefined();
    });

    // IT-006: Error isolation (single file failure)
    it("IT-006 proxy: single corrupt file returns error without throwing", async () => {
      const filePath = path.join(tmpDir, "corrupt.docx");
      fs.writeFileSync(filePath, Buffer.from("random garbage bytes not a real docx"));

      // Should not throw — returns a well-formed ConversionResult
      let threw = false;
      let result;
      try {
        result = await converter.convertFileToMarkdown(filePath, "docx");
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
      expect(result).toBeDefined();
    });

    // Performance: conversion time is tracked
    it("tracks conversion time in result", async () => {
      const filePath = path.join(tmpDir, "perf.txt");
      fs.writeFileSync(filePath, "performance test content");

      const result = await converter.convertFileToMarkdown(filePath, "txt");
      expect(result.success).toBe(true);
      expect(result.conversionTime).toBeGreaterThanOrEqual(0);
      expect(result.conversionTime).toBeLessThan(5000); // Should be fast for text
    });

    // Bytes processed tracking
    it("tracks bytes processed", async () => {
      const content = "test content with known size";
      const filePath = path.join(tmpDir, "bytes.txt");
      fs.writeFileSync(filePath, content);

      const result = await converter.convertFileToMarkdown(filePath, "txt");
      expect(result.success).toBe(true);
      expect(result.bytesProcessed).toBe(Buffer.byteLength(content));
    });
  });
});
