/**
 * Extension tests for Code Intelligence module (SA4E-44 Phase 3) —
 * Task #28 CodeIntelUploader + Task #30 OfflineQueue.
 * (Split from code-intel.test.ts — upload/queue concern.)
 */

import { describe, it, expect, vi } from "vitest";

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

import { CodeIntelUploader } from "../code-intel/CodeIntelUploader";
import { OfflineQueue } from "../code-intel/OfflineQueue";
import { FileUploadPayload } from "../code-intel/models";

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
