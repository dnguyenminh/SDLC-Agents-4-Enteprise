/**
 * Unit tests for converter.ts — isFileTooLarge, isTextFormat, wrapTextContent.
 *
 * Covers STC test cases: PBT-001..004, UT-017..018.
 * (Split from converter.test.ts — pure helpers concern.)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// We test the public API directly — for unit tests with mocked fs,
// we use vi.spyOn to control behavior without full module mock
// (which would break the converter's own fs import)

describe("converter.ts — Public API", () => {
  let converter: typeof import("../converter");

  beforeEach(async () => {
    vi.resetModules();
    converter = await import("../converter");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===== isFileTooLarge =====

  describe("isFileTooLarge", () => {
    // UT-017: PDF boundary at 50MB
    it("UT-017: PDF at exactly 50MB is NOT too large", () => {
      expect(converter.isFileTooLarge("pdf", 50 * 1024 * 1024)).toBe(false);
    });

    it("UT-017: PDF at 50MB + 1 byte IS too large", () => {
      expect(converter.isFileTooLarge("pdf", 50 * 1024 * 1024 + 1)).toBe(true);
    });

    it("UT-017: PDF under 50MB is NOT too large", () => {
      expect(converter.isFileTooLarge("pdf", 49 * 1024 * 1024)).toBe(false);
    });

    // UT-018: Image boundary at 20MB
    it("UT-018: PNG at exactly 20MB is NOT too large", () => {
      expect(converter.isFileTooLarge("png", 20 * 1024 * 1024)).toBe(false);
    });

    it("UT-018: PNG at 20MB + 1 byte IS too large", () => {
      expect(converter.isFileTooLarge("png", 20 * 1024 * 1024 + 1)).toBe(true);
    });

    it("UT-018: JPG at 20MB + 1 byte IS too large", () => {
      expect(converter.isFileTooLarge("jpg", 20 * 1024 * 1024 + 1)).toBe(true);
    });

    it("unknown format uses 50MB default limit", () => {
      expect(converter.isFileTooLarge("unknown", 50 * 1024 * 1024)).toBe(false);
      expect(converter.isFileTooLarge("unknown", 50 * 1024 * 1024 + 1)).toBe(true);
    });

    // PBT-004: Size limit check is monotonic
    it("PBT-004: monotonic — if size S fails, S+1 also fails", () => {
      const formats = ["pdf", "png", "jpg", "docx"];
      for (const fmt of formats) {
        // Find the boundary
        const limit = fmt === "png" || fmt === "jpg" ? 20 * 1024 * 1024 : 50 * 1024 * 1024;
        // At limit: OK
        expect(converter.isFileTooLarge(fmt, limit)).toBe(false);
        // Over limit: fail
        expect(converter.isFileTooLarge(fmt, limit + 1)).toBe(true);
        // Further over: still fail
        expect(converter.isFileTooLarge(fmt, limit + 100)).toBe(true);
      }
    });
  });

  // ===== isTextFormat =====

  describe("isTextFormat", () => {
    it("recognizes all text formats: txt, csv, json, xml, yaml, yml", () => {
      for (const fmt of ["txt", "csv", "json", "xml", "yaml", "yml"]) {
        expect(converter.isTextFormat(fmt)).toBe(true);
      }
    });

    it("rejects binary formats", () => {
      for (const fmt of ["docx", "pdf", "png", "xlsx", "pptx", "jpg"]) {
        expect(converter.isTextFormat(fmt)).toBe(false);
      }
    });

    // PBT-001 partial: classifyFormat always returns valid string for indexable formats
    it("PBT-001 proxy: isTextFormat returns boolean for any string", () => {
      const inputs = ["", "txt", "UNKNOWN", "pdf", "yaml", "123"];
      for (const inp of inputs) {
        const result = converter.isTextFormat(inp);
        expect(typeof result).toBe("boolean");
      }
    });
  });

  // ===== wrapTextContent =====

  describe("wrapTextContent", () => {
    // PBT-003: wraps and preserves content
    it("PBT-003: wraps content in code block and preserves original", () => {
      const content = "Hello World\nLine 2\nSpecial chars: <>&\"'";
      const result = converter.wrapTextContent(content, "txt");
      expect(result).toContain(content);
      expect(result.startsWith("```")).toBe(true);
    });

    it("uses correct language tag for each format", () => {
      expect(converter.wrapTextContent("x", "json")).toBe("```json\nx\n```");
      expect(converter.wrapTextContent("x", "csv")).toBe("```csv\nx\n```");
      expect(converter.wrapTextContent("x", "xml")).toBe("```xml\nx\n```");
      expect(converter.wrapTextContent("x", "txt")).toBe("```txt\nx\n```");
    });

    it("normalizes yml to yaml", () => {
      const result = converter.wrapTextContent("key: val", "yml");
      expect(result).toContain("```yaml");
      expect(result).not.toContain("```yml");
    });

    // PBT-003 property: always starts with code fence
    it("PBT-003: always starts with ``` for any format", () => {
      const formats = ["txt", "csv", "json", "xml", "yaml", "yml"];
      for (const fmt of formats) {
        const result = converter.wrapTextContent("test content", fmt);
        expect(result.startsWith("```")).toBe(true);
        expect(result.endsWith("```")).toBe(true);
      }
    });
  });
});
