/**
 * Unit tests for ProxyTestService — manual/system proxy connectivity testing.
 * (Split from proxy-test-service.test.ts — fetch-based concern; curl/powershell
 * transport modes live in proxy-test-service.transports.test.ts.)
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

interface FakeResponse {
  ok: boolean;
  status: number;
  statusText: string;
}

function errWithCode(message: string, code: string): Error {
  return Object.assign(new Error(message), { code });
}

describe("ProxyTestService", () => {
  let service: ProxyTestService;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
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

  it("returns No proxy URL when manual mode has no host", async () => {
    const result = await service.testConnection(input({ host: "" }));
    expect(result).toEqual({ success: false, message: "No proxy URL to test" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports success when manual proxy request returns OK", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, statusText: "OK" } as FakeResponse);
    const result = await service.testConnection(input({}));
    expect(result.success).toBe(true);
    expect(result.message).toBe("Proxy connection successful");
    expect(typeof result.latencyMs).toBe("number");
  });

  it("passes a dispatch agent and credentials to fetch for manual mode", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, statusText: "OK" } as FakeResponse);
    await service.testConnection(input({ username: "u", password: "p" }));
    const [url, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://httpbin.org/get");
    expect(options.dispatcher).toBeDefined();
  });

  it("reports auth required when proxy returns 407", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 407, statusText: "Proxy Authentication Required" } as FakeResponse);
    const result = await service.testConnection(input({}));
    expect(result).toEqual({
      success: false,
      message: "Proxy requires authentication — enter credentials",
    });
  });

  it("reports HTTP status for other non-OK responses", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, statusText: "Broken" } as FakeResponse);
    const result = await service.testConnection(input({}));
    expect(result).toMatchObject({ success: false, message: "HTTP 500: Broken" });
    expect(result.latencyMs).toBeTypeOf("number");
  });

  it("maps ECONNREFUSED to a friendly refusal message", async () => {
    fetchMock.mockRejectedValue(errWithCode("connect ECONNREFUSED", "ECONNREFUSED"));
    const result = await service.testConnection(input({}));
    expect(result).toEqual({
      success: false,
      message: "Connection refused — verify proxy host and port",
    });
  });

  it("maps ENOTFOUND to a resolution message", async () => {
    fetchMock.mockRejectedValue(errWithCode("getaddrinfo ENOTFOUND", "ENOTFOUND"));
    const result = await service.testConnection(input({}));
    expect(result.message).toBe("Cannot resolve proxy hostname");
  });

  it("maps TimeoutError to an unreachable message", async () => {
    const timeout = new Error("operation timed out");
    timeout.name = "TimeoutError";
    fetchMock.mockRejectedValue(timeout);
    const result = await service.testConnection(input({}));
    expect(result.message).toBe("Connection timed out — proxy may be unreachable");
  });

  it("maps SSL errors to a certificate message", async () => {
    fetchMock.mockRejectedValue(new Error("SSL certificate problem"));
    const result = await service.testConnection(input({}));
    expect(result.message).toContain("SSL error");
  });

  it("falls back to a generic message for unknown errors", async () => {
    fetchMock.mockRejectedValue(new Error("unexpected failure"));
    const result = await service.testConnection(input({}));
    expect(result).toEqual({ success: false, message: "Connection failed: unexpected failure" });
  });

  it("uses a custom testUrl when provided", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, statusText: "OK" } as FakeResponse);
    await service.testConnection(input({ testUrl: "https://example.com/check" }));
    expect(fetchMock.mock.calls[0][0]).toBe("https://example.com/check");
  });

  it("resolves system mode via OS-native detection fallback", async () => {
    service = new ProxyTestService(
      new StubDetectionService("http://corp-proxy:8080") as unknown as ProxyDetectionService
    );
    fetchMock.mockResolvedValue({ ok: true, status: 200, statusText: "OK" } as FakeResponse);
    const result = await service.testConnection(input({ mode: "system" }));
    expect(result.success).toBe(true);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ dispatcher: expect.anything() });
  });

  it("returns No proxy URL when system resolution yields no proxy", async () => {
    const result = await service.testConnection(input({ mode: "system" }));
    expect(result).toEqual({ success: false, message: "No proxy URL to test" });
  });
});
