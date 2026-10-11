/**
 * Unit tests for global-fetch-patch — verifies fetch proxy injection behavior.
 * Strategy: We test the patching logic by verifying the patchedFetch wrapper
 * routes through curl/powershell adapters or injects undici dispatcher based
 * on ProxyAgentFactory config mode.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The module captures `originalFetch = globalThis.fetch` at module-load time.
// To test properly, we must stub globalThis.fetch BEFORE importing the module.
const fetchSpy = vi.hoisted(() => vi.fn().mockResolvedValue(new Response("ok", { status: 200 })));

vi.hoisted(() => {
  globalThis.fetch = fetchSpy;
});

// Mock ProxyAgentFactory
const mockDispatcher = { type: "mock-proxy-dispatcher" };
const mockFactory = {
  getConfig: vi.fn(() => ({ mode: "manual", host: "proxy.corp", port: 8080, bypass: "localhost,127.0.0.1" })),
  shouldBypass: vi.fn((url: string, bypass: string) => {
    const hostname = new URL(url).hostname.toLowerCase();
    return bypass.split(",").map(e => e.trim()).includes(hostname);
  }),
  getDispatcher: vi.fn(() => Promise.resolve(mockDispatcher)),
};

vi.mock("../ProxyAgentFactory", () => ({
  ProxyAgentFactory: {
    getInstance: () => mockFactory,
  },
}));

// Mock CurlHttpAdapter — use vi.hoisted to ensure availability before vi.mock factory runs
const { mockCurlRequest, mockCurlIsCurlMode, mockCurlShouldBypass } = vi.hoisted(() => ({
  mockCurlRequest: vi.fn().mockResolvedValue({ status: 200, ok: true, body: '{"curl":true}', statusText: "OK" }),
  mockCurlIsCurlMode: vi.fn(() => false),
  mockCurlShouldBypass: vi.fn(() => false),
}));

vi.mock("../CurlHttpAdapter", () => ({
  CurlHttpAdapter: class {
    isCurlMode = mockCurlIsCurlMode;
    shouldBypass = mockCurlShouldBypass;
    request = mockCurlRequest;
  },
}));

// Mock PowerShellHttpAdapter
const { mockPwshRequest, mockPwshIsPowerShellMode, mockPwshShouldBypass } = vi.hoisted(() => ({
  mockPwshRequest: vi.fn().mockResolvedValue({ status: 200, ok: true, body: '{"pwsh":true}', statusText: "OK" }),
  mockPwshIsPowerShellMode: vi.fn(() => false),
  mockPwshShouldBypass: vi.fn(() => false),
}));

vi.mock("../PowerShellHttpAdapter", () => ({
  PowerShellHttpAdapter: class {
    isPowerShellMode = mockPwshIsPowerShellMode;
    shouldBypass = mockPwshShouldBypass;
    request = mockPwshRequest;
  },
}));

import { applyGlobalFetchPatch, removeGlobalFetchPatch, getDirectFetchDispatcher } from "../global-fetch-patch";

describe("global-fetch-patch", () => {
  beforeEach(() => {
    removeGlobalFetchPatch();
    fetchSpy.mockClear();
    mockCurlRequest.mockClear();
    mockPwshRequest.mockClear();
    mockCurlIsCurlMode.mockReturnValue(false);
    mockCurlShouldBypass.mockReturnValue(false);
    mockPwshIsPowerShellMode.mockReturnValue(false);
    mockPwshShouldBypass.mockReturnValue(false);
    mockFactory.getConfig.mockReturnValue({ mode: "manual", host: "proxy.corp", port: 8080, bypass: "localhost,127.0.0.1" });
    mockFactory.shouldBypass.mockImplementation((url: string, bypass: string) => {
      const hostname = new URL(url).hostname.toLowerCase();
      return bypass.split(",").map(e => e.trim()).includes(hostname);
    });
    mockFactory.getDispatcher.mockResolvedValue(mockDispatcher);
  });

  afterEach(() => {
    removeGlobalFetchPatch();
  });

  describe("system/manual mode (undici dispatcher)", () => {
    it("injects proxy dispatcher for external URLs", async () => {
      applyGlobalFetchPatch();

      await globalThis.fetch("https://api.example.com/data");

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe("https://api.example.com/data");
      expect((init as any).dispatcher).toBe(mockDispatcher);
    });

    it("does NOT override existing dispatcher in init options", async () => {
      applyGlobalFetchPatch();
      const customDispatcher = { type: "custom-dispatcher" };

      await globalThis.fetch("https://api.example.com/data", { dispatcher: customDispatcher } as any);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [, init] = fetchSpy.mock.calls[0];
      expect((init as any).dispatcher).toBe(customDispatcher);
    });

    it("handles URL object input correctly", async () => {
      applyGlobalFetchPatch();

      await globalThis.fetch(new URL("https://external.api.com/resource"));

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [, init] = fetchSpy.mock.calls[0];
      expect((init as any).dispatcher).toBe(mockDispatcher);
    });
  });

  describe("bypass behavior", () => {
    it("injects direct (raised-timeout) dispatcher — NOT proxy — for bypassed URLs (localhost)", async () => {
      applyGlobalFetchPatch();

      await globalThis.fetch("http://localhost:48721/health");

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe("http://localhost:48721/health");
      expect((init as any).dispatcher).toBe(getDirectFetchDispatcher());
      expect((init as any).dispatcher).not.toBe(mockDispatcher);
    });

    it("injects direct dispatcher for bypassed URLs (127.0.0.1)", async () => {
      applyGlobalFetchPatch();

      await globalThis.fetch("http://127.0.0.1:9181/mcp");

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [, init] = fetchSpy.mock.calls[0];
      expect((init as any).dispatcher).toBe(getDirectFetchDispatcher());
    });

    it("bypassed URLs go direct even in curl mode", async () => {
      mockCurlIsCurlMode.mockReturnValue(true);
      mockFactory.getConfig.mockReturnValue({ mode: "curl", bypass: "localhost,127.0.0.1" });
      mockFactory.shouldBypass.mockReturnValue(true);
      applyGlobalFetchPatch();

      await globalThis.fetch("http://localhost:48721/health");

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(mockCurlRequest).not.toHaveBeenCalled();
    });
  });

  describe("none mode", () => {
    it("goes direct with raised-timeout dispatcher when mode is none", async () => {
      mockFactory.getConfig.mockReturnValue({ mode: "none", bypass: "" });
      applyGlobalFetchPatch();

      await globalThis.fetch("https://api.example.com/data");

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [, init] = fetchSpy.mock.calls[0];
      expect((init as any).dispatcher).toBe(getDirectFetchDispatcher());
    });
  });

  describe("curl mode", () => {
    beforeEach(() => {
      mockCurlIsCurlMode.mockReturnValue(true);
      mockFactory.getConfig.mockReturnValue({ mode: "curl", bypass: "localhost" });
    });

    it("routes through CurlHttpAdapter for external URLs", async () => {
      applyGlobalFetchPatch();

      const response = await globalThis.fetch("https://pega.corp.com/prweb/api");

      expect(mockCurlRequest).toHaveBeenCalledWith(
        "https://pega.corp.com/prweb/api", "GET", {}, undefined, 30000, true
      );
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(response.status).toBe(200);
      const body = await response.text();
      expect(body).toBe('{"curl":true}');
    });

    it("passes method, headers, and body to curl adapter", async () => {
      applyGlobalFetchPatch();

      await globalThis.fetch("https://pega.corp.com/prweb/api", {
        method: "POST",
        headers: { "Authorization": "Basic abc", "Content-Type": "application/json" },
        body: '{"data":1}',
      });

      expect(mockCurlRequest).toHaveBeenCalledWith(
        "https://pega.corp.com/prweb/api",
        "POST",
        { "Authorization": "Basic abc", "Content-Type": "application/json" },
        '{"data":1}',
        30000,
        true
      );
    });

    it("does NOT call originalFetch when curl handles the request", async () => {
      applyGlobalFetchPatch();

      await globalThis.fetch("https://external.api.com/resource");

      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe("powershell mode", () => {
    beforeEach(() => {
      mockPwshIsPowerShellMode.mockReturnValue(true);
      mockFactory.getConfig.mockReturnValue({ mode: "powershell", bypass: "localhost" });
    });

    it("routes through PowerShellHttpAdapter for external URLs", async () => {
      applyGlobalFetchPatch();

      const response = await globalThis.fetch("https://jira.corp.com/rest/api/2/myself");

      expect(mockPwshRequest).toHaveBeenCalledWith(
        "https://jira.corp.com/rest/api/2/myself", "GET", {}, undefined, 30000
      );
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(response.status).toBe(200);
      const body = await response.text();
      expect(body).toBe('{"pwsh":true}');
    });

    it("passes method, headers, and body to powershell adapter", async () => {
      applyGlobalFetchPatch();

      await globalThis.fetch("https://api.anthropic.com/v1/models", {
        method: "POST",
        headers: { "Authorization": "Bearer key123" },
        body: '{"model":"claude"}',
      });

      expect(mockPwshRequest).toHaveBeenCalledWith(
        "https://api.anthropic.com/v1/models",
        "POST",
        { "Authorization": "Bearer key123" },
        '{"model":"claude"}',
        30000
      );
    });
  });

  describe("patch lifecycle", () => {
    it("only patches once even if called multiple times", () => {
      applyGlobalFetchPatch();
      const patchedRef = globalThis.fetch;
      applyGlobalFetchPatch();

      expect(globalThis.fetch).toBe(patchedRef);
    });

    it("removeGlobalFetchPatch restores original fetch", () => {
      applyGlobalFetchPatch();
      expect(globalThis.fetch).not.toBe(fetchSpy);

      removeGlobalFetchPatch();
      expect(globalThis.fetch).toBe(fetchSpy);
    });
  });

  describe("error handling", () => {
    it("falls through gracefully when ProxyAgentFactory throws", async () => {
      mockFactory.getConfig.mockImplementation(() => { throw new Error("Not initialized"); });
      mockFactory.getDispatcher.mockRejectedValue(new Error("Not initialized"));
      applyGlobalFetchPatch();

      await globalThis.fetch("https://api.example.com/data");

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [, init] = fetchSpy.mock.calls[0];
      // Factory failure → no proxy dispatcher → falls back to the shared
      // direct (raised-timeout) dispatcher instead of crashing.
      expect((init as any)?.dispatcher).toBe(getDirectFetchDispatcher());
    });
  });
});
