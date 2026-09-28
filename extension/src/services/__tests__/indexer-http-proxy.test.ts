/**
 * Unit tests for IndexerHttpClient — verifies refactored methods use fetch() (proxy-patched).
 * Tests httpPostJson, httpGet, syncCodeSymbols, and getEnrichmentStatus.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("vscode", () => ({
  workspace: {
    workspaceFolders: [{ uri: { fsPath: "C:\\ws\\test" } }],
    getConfiguration: () => ({ get: (_k: string, def?: unknown) => def }),
    findFiles: () => Promise.resolve([]),
    fs: { readFile: () => Promise.resolve(Buffer.from("")) },
  },
  window: {
    createStatusBarItem: () => ({ show: vi.fn(), dispose: vi.fn(), text: "", tooltip: "" }),
    createOutputChannel: () => ({ appendLine: vi.fn(), show: vi.fn() }),
  },
  StatusBarAlignment: { Left: 1 },
  Uri: { file: (p: string) => ({ fsPath: p }) },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  TreeItem: class { constructor(public label: string) {} },
  EventEmitter: class {
    event = () => ({ dispose: () => {} });
    fire() {}
    dispose() {}
  },
}));

// Mock the dynamic import("../extension") used by buildHeaders
vi.mock("../../extension", () => ({
  getProjectId: () => "test-project-123",
}));

vi.mock("../../utils/http-client-utils", () => ({
  httpPostJson: vi.fn().mockResolvedValue({}),
}));

import { IndexerHttpClient } from "../IndexerHttpClient";

describe("IndexerHttpClient — proxy-compliant fetch usage", () => {
  let client: IndexerHttpClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    client = new IndexerHttpClient("http://localhost:48721");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("getEnrichmentStatus (delegates to httpGet)", () => {
    it("calls fetch with GET method and auth headers", async () => {
      fetchMock.mockResolvedValue({
        status: 200,
        text: () => Promise.resolve('{"status":"active"}'),
      });

      const result = await client.getEnrichmentStatus("my-token");

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("http://localhost:48721/api/v1/enrichment/status");
      expect(init.method).toBe("GET");
      expect(init.headers?.Authorization).toBe("Bearer my-token");
      expect(init.headers?.["X-Project-Id"]).toBe("test-project-123");
      expect(result).toEqual({ ok: true, body: '{"status":"active"}' });
    });

    it("returns ok=false on non-200 status", async () => {
      fetchMock.mockResolvedValue({
        status: 500,
        text: () => Promise.resolve("Internal Server Error"),
      });

      const result = await client.getEnrichmentStatus("my-token");

      expect(result.ok).toBe(false);
      expect(result.body).toBe("Internal Server Error");
    });

    it("returns ok=false and empty body on network error", async () => {
      fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

      const result = await client.getEnrichmentStatus("my-token");

      expect(result).toEqual({ ok: false, body: "" });
    });
  });

  describe("syncPegaRulesToKb (delegates to httpPostJson)", () => {
    it("calls fetch with POST method, JSON body, and Content-Type header", async () => {
      fetchMock.mockResolvedValue({
        status: 200,
        text: () => Promise.resolve('{"message":"synced 42 rules"}'),
      });

      const result = await client.syncPegaRulesToKb("proj-abc", "my-token");

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("http://localhost:48721/api/index/sync-pega-rules");
      expect(init.method).toBe("POST");
      expect(init.headers?.["Content-Type"]).toBe("application/json");
      expect(init.headers?.Authorization).toBe("Bearer my-token");
      expect(JSON.parse(init.body)).toEqual({ projectId: "proj-abc" });
      expect(result).toEqual({ message: "synced 42 rules" });
    });

    it("returns failure message on non-ok response", async () => {
      fetchMock.mockResolvedValue({
        status: 500,
        text: () => Promise.resolve("server error"),
      });

      const result = await client.syncPegaRulesToKb("proj-abc", "my-token");

      expect(result.message).toContain("Pega sync failed");
    });

    it("returns failure on network error (non-fatal)", async () => {
      fetchMock.mockRejectedValue(new Error("timeout"));

      const result = await client.syncPegaRulesToKb("proj-abc", "my-token");

      expect(result.message).toContain("Pega sync failed");
    });

    it("refreshes the token and retries once on 401 (long crawl outlives JWT)", async () => {
      // First POST → 401 (expired token), retry with refreshed token → 200.
      fetchMock
        .mockResolvedValueOnce({ status: 401, text: () => Promise.resolve("Unauthorized") })
        .mockResolvedValueOnce({ status: 200, text: () => Promise.resolve('{"message":"synced"}') });
      const refresher = vi.fn().mockResolvedValue("fresh-token");
      client.setTokenRefresher(refresher);

      const result = await client.syncPegaRulesToKb("proj-abc", "stale-token");

      expect(refresher).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      // Retry used the fresh token
      expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe("Bearer fresh-token");
      expect(result).toEqual({ message: "synced" });
    });

    it("fails gracefully if refresh yields no token on 401", async () => {
      fetchMock.mockResolvedValue({ status: 401, text: () => Promise.resolve("Unauthorized") });
      client.setTokenRefresher(vi.fn().mockResolvedValue(undefined));

      const result = await client.syncPegaRulesToKb("proj-abc", "stale-token");

      expect(result.message).toContain("Pega sync failed");
    });
  });

  describe("syncCodeSymbols", () => {
    it("calls fetch with MCP JSON-RPC payload and Accept header", async () => {
      const mcpResponse = { result: { content: [{ type: "text", text: "Synced 100 symbols" }] } };
      fetchMock.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(mcpResponse)),
      });

      const result = await client.syncCodeSymbols();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("http://localhost:48721/mcp");
      expect(init.method).toBe("POST");
      expect(init.headers?.["Content-Type"]).toBe("application/json");
      expect(init.headers?.Accept).toBe("application/json, text/event-stream");
      const body = JSON.parse(init.body);
      expect(body.method).toBe("tools/call");
      expect(body.params.name).toBe("mem_sync_code");
      expect(result).toBe("Synced 100 symbols");
    });

    it("returns null on non-ok response", async () => {
      fetchMock.mockResolvedValue({ ok: false });

      const result = await client.syncCodeSymbols();

      expect(result).toBeNull();
    });

    it("returns null on network error", async () => {
      fetchMock.mockRejectedValue(new Error("ECONNRESET"));

      const result = await client.syncCodeSymbols();

      expect(result).toBeNull();
    });

    it("returns null when response has no text content", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ result: { content: [] } }),
      });

      const result = await client.syncCodeSymbols();

      expect(result).toBeNull();
    });
  });

  describe("fetch timeout signals", () => {
    it("httpGet uses AbortSignal.timeout", async () => {
      fetchMock.mockResolvedValue({ status: 200, text: () => Promise.resolve("ok") });

      await client.getEnrichmentStatus();

      const [, init] = fetchMock.mock.calls[0];
      expect(init.signal).toBeDefined();
    });

    it("syncCodeSymbols uses AbortSignal.timeout", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

      await client.syncCodeSymbols();

      const [, init] = fetchMock.mock.calls[0];
      expect(init.signal).toBeDefined();
    });
  });
});
