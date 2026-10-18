/**
 * Unit tests for ProxyTestService — curl and powershell transport modes.
 * (Split from proxy-test-service.test.ts — transport-mode concern.)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ProxyTestService } from "../ProxyTestService";
import type { ProxyDetectionService } from "../ProxyDetectionService";
import type { ProxyTestInput } from "../../models/ProxyModels";

vi.mock("vscode", () => ({
  workspace: {
    getConfiguration: () => ({
      get: (_key: string, defaultValue?: unknown) => defaultValue,
      update: () => Promise.resolve(),
    }),
  },
}));

class StubDetectionService {
  constructor(private readonly osNativeUrl: string | null) {}
  detect() { return { url: this.osNativeUrl, bypass: null }; }
  detectOsNative() { return { url: this.osNativeUrl, bypass: null }; }
}

describe("ProxyTestService", () => {
  let service: ProxyTestService;

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    service = new ProxyTestService(new StubDetectionService(null) as unknown as ProxyDetectionService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function input(overrides: Partial<ProxyTestInput>): ProxyTestInput {
    return {
      mode: "manual",
      host: "proxy.corp",
      port: 8080,
      ...overrides,
    };
  }

  describe("curl mode", () => {
    it("returns success when curl test connection succeeds", async () => {
      const mockIsAvailable = vi.spyOn(
        await import("../CurlTransport").then(m => m.CurlTransport),
        "isAvailable"
      ).mockResolvedValue(true);

      const { CurlTransport } = await import("../CurlTransport");
      vi.spyOn(CurlTransport.prototype, "testConnection").mockResolvedValue(42);

      const result = await service.testConnection(input({ mode: "curl", host: "proxy.corp", port: 8080 }));
      expect(result.success).toBe(true);
      expect(result.message).toBe("Curl proxy connection successful");
      expect(result.latencyMs).toBe(42);

      mockIsAvailable.mockRestore();
    });

    it("returns error when curl is not available", async () => {
      const mockIsAvailable = vi.spyOn(
        await import("../CurlTransport").then(m => m.CurlTransport),
        "isAvailable"
      ).mockResolvedValue(false);

      const result = await service.testConnection(input({ mode: "curl" }));
      expect(result.success).toBe(false);
      expect(result.message).toContain("curl.exe not found");

      mockIsAvailable.mockRestore();
    });

    it("returns error message when curl test connection throws", async () => {
      const mockIsAvailable = vi.spyOn(
        await import("../CurlTransport").then(m => m.CurlTransport),
        "isAvailable"
      ).mockResolvedValue(true);

      const { CurlTransport } = await import("../CurlTransport");
      vi.spyOn(CurlTransport.prototype, "testConnection").mockRejectedValue(
        new Error("Connection refused — verify proxy host and port")
      );

      const result = await service.testConnection(input({ mode: "curl", host: "bad-proxy", port: 9999 }));
      expect(result.success).toBe(false);
      expect(result.message).toContain("Connection refused");

      mockIsAvailable.mockRestore();
    });
  });

  describe("powershell mode", () => {
    it("returns success when powershell test connection succeeds", async () => {
      const mockIsAvailable = vi.spyOn(
        await import("../PowerShellTransport").then(m => m.PowerShellTransport),
        "isAvailable"
      ).mockResolvedValue(true);

      const { PowerShellTransport } = await import("../PowerShellTransport");
      vi.spyOn(PowerShellTransport.prototype, "testConnection").mockResolvedValue(55);

      const result = await service.testConnection(input({ mode: "powershell", host: "proxy.corp", port: 8080 }));
      expect(result.success).toBe(true);
      expect(result.message).toBe("PowerShell proxy connection successful");
      expect(result.latencyMs).toBe(55);

      mockIsAvailable.mockRestore();
    });

    it("returns error when powershell is not available", async () => {
      const mockIsAvailable = vi.spyOn(
        await import("../PowerShellTransport").then(m => m.PowerShellTransport),
        "isAvailable"
      ).mockResolvedValue(false);

      const result = await service.testConnection(input({ mode: "powershell" }));
      expect(result.success).toBe(false);
      expect(result.message).toContain("PowerShell not found");

      mockIsAvailable.mockRestore();
    });

    it("returns error message when powershell test connection throws", async () => {
      const mockIsAvailable = vi.spyOn(
        await import("../PowerShellTransport").then(m => m.PowerShellTransport),
        "isAvailable"
      ).mockResolvedValue(true);

      const { PowerShellTransport } = await import("../PowerShellTransport");
      vi.spyOn(PowerShellTransport.prototype, "testConnection").mockRejectedValue(
        new Error("HTTP 503: Service Unavailable")
      );

      const result = await service.testConnection(input({ mode: "powershell", host: "proxy.corp", port: 8080 }));
      expect(result.success).toBe(false);
      expect(result.message).toContain("503");

      mockIsAvailable.mockRestore();
    });
  });
});
