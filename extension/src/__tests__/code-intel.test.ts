/**
 * Extension tests for Code Intelligence module (SA4E-44 Phase 3) —
 * Task #25 TimestampResolver + Task #26 HashCache.
 * (Split from code-intel.test.ts — timestamp/hash concern.)
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
import { TimestampResolver } from "../code-intel/TimestampResolver";
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
