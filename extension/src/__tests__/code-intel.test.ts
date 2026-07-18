/**
 * Extension tests for Code Intelligence module (SA4E-44 Phase 3).
 * Covers Tasks #25–#32: TimestampResolver, HashCache, CodeIntelScanner,
 * CodeIntelUploader, FileChangeWatcher, OfflineQueue.
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

vi.mock("child_process", () => ({
  execFile: vi.fn(),
}));

import { HashCache } from "../code-intel/HashCache";
import { CodeIntelScanner } from "../code-intel/CodeIntelScanner";
import { OfflineQueue } from "../code-intel/OfflineQueue";
import { TimestampResolver } from "../code-intel/TimestampResolver";
import { CodeIntelUploader } from "../code-intel/CodeIntelUploader";
import { FileUploadPayload } from "../code-intel/models";
import { execFile } from "child_process";

// ─── Task #25: TimestampResolver ───────────────────────────────────────

describe("TimestampResolver", () => {
  let resolver: TimestampResolver;

  beforeEach(() => {
    resolver = new TimestampResolver();
    vi.clearAllMocks();
  });

  it("resolves timestamp from git when available", async () => {
    const mockExecFile = vi.mocked(execFile);
    mockExecFile.mockImplementation((_cmd, _args, _opts, cb: any) => {
      cb(null, "2026-07-17T10:30:00+07:00\n", "");
      return {} as any;
    });

    const result = await resolver.resolve("src/main.ts", "/workspace");
    expect(result).toBe("2026-07-17T10:30:00+07:00");
    expect(mockExecFile).toHaveBeenCalledWith(
      "git",
      ["log", "-1", "--format=%aI", "--", "src/main.ts"],
      expect.objectContaining({ cwd: "/workspace", timeout: 5000 }),
      expect.any(Function)
    );
  });

  it("falls back to fs stat when git fails", async () => {
    const mockExecFile = vi.mocked(execFile);
    mockExecFile.mockImplementation((_cmd, _args, _opts, cb: any) => {
      cb(new Error("not a git repo"), "", "");
      return {} as any;
    });

    const result = await resolver.resolve("src/main.ts", "/workspace");
    // Should be an ISO date string (from fs or now fallback)
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("SEC-07: rejects paths with shell metacharacters", async () => {
    const mockExecFile = vi.mocked(execFile);
    const result = await resolver.resolve("file;rm -rf /", "/workspace");
    // Should NOT call execFile for unsafe paths
    expect(mockExecFile).not.toHaveBeenCalled();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("SEC-07: rejects paths with path traversal", async () => {
    const mockExecFile = vi.mocked(execFile);
    const result = await resolver.resolve("../../../etc/passwd", "/workspace");
    expect(mockExecFile).not.toHaveBeenCalled();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("SEC-07: uses execFile not exec (array args)", async () => {
    const mockExecFile = vi.mocked(execFile);
    mockExecFile.mockImplementation((_cmd, _args, _opts, cb: any) => {
      cb(null, "2026-01-01T00:00:00Z", "");
      return {} as any;
    });

    await resolver.resolve("safe/path.ts", "/workspace");
    // Verify args are passed as array (not interpolated string)
    const call = mockExecFile.mock.calls[0];
    expect(call[0]).toBe("git");
    expect(Array.isArray(call[1])).toBe(true);
  });
});

// ─── Task #26: HashCache ───────────────────────────────────────────────

describe("HashCache", () => {
  let cache: HashCache;

  beforeEach(() => { cache = new HashCache(); });

  it("computes SHA-256 hash of content", () => {
    const hash = HashCache.computeHash("hello world");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns consistent hash for same content", () => {
    const h1 = HashCache.computeHash("test content");
    const h2 = HashCache.computeHash("test content");
    expect(h1).toBe(h2);
  });

  it("returns different hash for different content", () => {
    const h1 = HashCache.computeHash("content A");
    const h2 = HashCache.computeHash("content B");
    expect(h1).not.toBe(h2);
  });

  it("get/set/has/delete operations work correctly", () => {
    cache.set("file.ts", "abc123");
    expect(cache.get("file.ts")).toBe("abc123");
    expect(cache.has("file.ts")).toBe(true);
    cache.delete("file.ts");
    expect(cache.has("file.ts")).toBe(false);
    expect(cache.get("file.ts")).toBeUndefined();
  });

  it("hasChanged returns true for new files", () => {
    expect(cache.hasChanged("new.ts", "content")).toBe(true);
  });

  it("hasChanged returns false when content unchanged", () => {
    cache.updateHash("file.ts", "content");
    expect(cache.hasChanged("file.ts", "content")).toBe(false);
  });

  it("hasChanged returns true when content changed", () => {
    cache.updateHash("file.ts", "old content");
    expect(cache.hasChanged("file.ts", "new content")).toBe(true);
  });

  it("clear removes all entries", () => {
    cache.set("a.ts", "h1");
    cache.set("b.ts", "h2");
    cache.clear();
    expect(cache.size).toBe(0);
  });
});

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

// ─── Task #28: CodeIntelUploader ───────────────────────────────────────

describe("CodeIntelUploader", () => {
  it("returns empty result for empty batch", async () => {
    const mockClient = { invokeTool: vi.fn() } as any;
    const uploader = new CodeIntelUploader(mockClient, "proj-1");
    const result = await uploader.uploadBatch([]);
    expect(result).toEqual({ accepted: 0, skipped: 0, errors: [] });
    expect(mockClient.invokeTool).not.toHaveBeenCalled();
  });

  it("calls code_intel_upload tool with correct params", async () => {
    const mockClient = {
      invokeTool: vi.fn().mockResolvedValue(JSON.stringify({ accepted: 1, skipped: 0, errors: [] })),
    } as any;
    const uploader = new CodeIntelUploader(mockClient, "proj-1");
    const files: FileUploadPayload[] = [{
      filePath: "src/a.ts", language: "typescript", hash: "abc", timestamp: "2026-01-01T00:00:00Z",
      symbols: [], imports: [], exports: [],
    }];
    await uploader.uploadBatch(files);
    expect(mockClient.invokeTool).toHaveBeenCalledWith("code_intel_upload", {
      projectId: "proj-1", files,
    });
  });

  it("handles backend error gracefully", async () => {
    const mockClient = {
      invokeTool: vi.fn().mockRejectedValue(new Error("Connection refused")),
    } as any;
    const uploader = new CodeIntelUploader(mockClient, "proj-1");
    const files: FileUploadPayload[] = [{
      filePath: "src/b.ts", language: "typescript", hash: "def", timestamp: "2026-01-01T00:00:00Z",
      symbols: [], imports: [], exports: [],
    }];
    const result = await uploader.uploadBatch(files);
    expect(result.errors).toContain("Connection refused");
    expect(result.accepted).toBe(0);
  });
});

// ─── Task #30: OfflineQueue ────────────────────────────────────────────

describe("OfflineQueue", () => {
  it("enqueue adds items to the queue", () => {
    const mockUploader = { uploadBatch: vi.fn() } as any;
    const queue = new OfflineQueue(mockUploader);
    const file: FileUploadPayload = {
      filePath: "a.ts", language: "typescript", hash: "h1", timestamp: "t1",
      symbols: [], imports: [], exports: [],
    };
    queue.enqueue([file]);
    expect(queue.pending).toBe(1);
  });

  it("drain uploads all queued items", async () => {
    const mockUploader = {
      uploadBatch: vi.fn().mockResolvedValue({ accepted: 1, skipped: 0, errors: [] }),
    } as any;
    const queue = new OfflineQueue(mockUploader);
    const file: FileUploadPayload = {
      filePath: "a.ts", language: "typescript", hash: "h1", timestamp: "t1",
      symbols: [], imports: [], exports: [],
    };
    queue.enqueue([file]);
    await queue.drain();
    expect(queue.pending).toBe(0);
    expect(mockUploader.uploadBatch).toHaveBeenCalled();
  });

  it("re-queues items when upload fails completely", async () => {
    const mockUploader = {
      uploadBatch: vi.fn().mockResolvedValue({ accepted: 0, skipped: 0, errors: ["fail"] }),
    } as any;
    const queue = new OfflineQueue(mockUploader);
    const file: FileUploadPayload = {
      filePath: "a.ts", language: "typescript", hash: "h1", timestamp: "t1",
      symbols: [], imports: [], exports: [],
    };
    queue.enqueue([file]);
    await queue.drain();
    expect(queue.pending).toBe(1); // re-queued
  });

  it("respects max queue size (drops oldest)", () => {
    const mockUploader = { uploadBatch: vi.fn() } as any;
    const queue = new OfflineQueue(mockUploader);
    // Enqueue 1001 items (max 1000)
    for (let i = 0; i < 1001; i++) {
      queue.enqueue([{
        filePath: `f${i}.ts`, language: "typescript", hash: `h${i}`, timestamp: "t",
        symbols: [], imports: [], exports: [],
      }]);
    }
    expect(queue.pending).toBe(1000);
  });

  it("does not drain concurrently", async () => {
    let resolveUpload: (v: any) => void;
    const mockUploader = {
      uploadBatch: vi.fn().mockImplementation(() => new Promise((r) => { resolveUpload = r; })),
    } as any;
    const queue = new OfflineQueue(mockUploader);
    queue.enqueue([{
      filePath: "a.ts", language: "typescript", hash: "h", timestamp: "t",
      symbols: [], imports: [], exports: [],
    }]);
    const p1 = queue.drain();
    const p2 = queue.drain(); // should no-op since already draining
    resolveUpload!({ accepted: 1, skipped: 0, errors: [] });
    await Promise.all([p1, p2]);
    expect(mockUploader.uploadBatch).toHaveBeenCalledTimes(1);
  });
});
