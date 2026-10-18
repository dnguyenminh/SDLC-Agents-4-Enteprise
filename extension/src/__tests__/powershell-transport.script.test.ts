/**
 * Unit tests for PowerShellTransport — script building, system proxy
 * detection, availability and connection testing.
 * (Split from powershell-transport.test.ts — script/detect concern.)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock child_process before importing module
vi.mock("child_process", () => ({
  execFile: vi.fn(),
}));
vi.mock("util", () => ({
  promisify: (fn: unknown) => fn,
}));

import { PowerShellTransport } from "../proxy/PowerShellTransport";
import { execFile } from "child_process";

const mockExecFile = vi.mocked(execFile);

describe("PowerShellTransport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("script building", () => {
    it("includes proxy params when proxyUrl provided", async () => {
      mockExecFile.mockResolvedValueOnce({
        stdout: "---PWSH_STATUS---\n200\n---PWSH_STATUS_TEXT---\nOK\n---PWSH_HEADERS---\n\n---PWSH_BODY---\nok",
        stderr: "",
      } as never);

      const transport = new PowerShellTransport("http://10.30.168.246:9090");
      await transport.request("https://example.com");

      const scriptArg = mockExecFile.mock.calls[0][1]![3] as string;
      expect(scriptArg).toContain("Proxy = 'http://10.30.168.246:9090'");
      expect(scriptArg).toContain("ProxyUseDefaultCredentials = $true");
    });

    it("does NOT include proxy params when proxyUrl is null", async () => {
      mockExecFile.mockResolvedValueOnce({
        stdout: "---PWSH_STATUS---\n200\n---PWSH_STATUS_TEXT---\nOK\n---PWSH_HEADERS---\n\n---PWSH_BODY---\nok",
        stderr: "",
      } as never);

      const transport = new PowerShellTransport(null);
      await transport.request("https://example.com");

      const scriptArg = mockExecFile.mock.calls[0][1]![3] as string;
      expect(scriptArg).not.toContain("Proxy =");
      expect(scriptArg).not.toContain("ProxyUseDefaultCredentials");
    });

    it("uses correct HTTP method", async () => {
      mockExecFile.mockResolvedValueOnce({
        stdout: "---PWSH_STATUS---\n200\n---PWSH_STATUS_TEXT---\nOK\n---PWSH_HEADERS---\n\n---PWSH_BODY---\n{}",
        stderr: "",
      } as never);

      const transport = new PowerShellTransport(null);
      await transport.request("https://example.com", { method: "PUT" });

      const scriptArg = mockExecFile.mock.calls[0][1]![3] as string;
      expect(scriptArg).toContain("Method = 'PUT'");
    });

    it("includes body for POST requests", async () => {
      mockExecFile.mockResolvedValueOnce({
        stdout: "---PWSH_STATUS---\n201\n---PWSH_STATUS_TEXT---\nCreated\n---PWSH_HEADERS---\n\n---PWSH_BODY---\n{}",
        stderr: "",
      } as never);

      const transport = new PowerShellTransport(null);
      await transport.request("https://example.com", {
        method: "POST",
        body: '{"name":"test"}',
        headers: { "Content-Type": "application/json" },
      });

      const scriptArg = mockExecFile.mock.calls[0][1]![3] as string;
      expect(scriptArg).toContain("$params.Body = '{\"name\":\"test\"}'");
      expect(scriptArg).toContain("$params.ContentType = 'application/json'");
    });

    it("escapes single quotes in values", async () => {
      mockExecFile.mockResolvedValueOnce({
        stdout: "---PWSH_STATUS---\n200\n---PWSH_STATUS_TEXT---\nOK\n---PWSH_HEADERS---\n\n---PWSH_BODY---\nok",
        stderr: "",
      } as never);

      const transport = new PowerShellTransport(null);
      await transport.request("https://example.com/path?it's=ok");

      const scriptArg = mockExecFile.mock.calls[0][1]![3] as string;
      expect(scriptArg).toContain("it''s=ok");
    });
  });

  describe("detectSystemProxy", () => {
    it("returns proxy URL when .NET detects proxy", async () => {
      mockExecFile.mockResolvedValueOnce({
        stdout: "http://10.30.168.246:9090/\n",
        stderr: "",
      } as never);

      const result = await PowerShellTransport.detectSystemProxy();
      expect(result).toBe("http://10.30.168.246:9090/");
    });

    it("returns null when DIRECT (no proxy)", async () => {
      mockExecFile.mockResolvedValueOnce({
        stdout: "DIRECT\n",
        stderr: "",
      } as never);

      const result = await PowerShellTransport.detectSystemProxy();
      expect(result).toBeNull();
    });

    it("returns null when PowerShell fails", async () => {
      mockExecFile.mockRejectedValueOnce(new Error("pwsh not found"));

      const result = await PowerShellTransport.detectSystemProxy();
      expect(result).toBeNull();
    });
  });

  describe("isAvailable", () => {
    it("returns true when PowerShell responds", async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: "ok\n", stderr: "" } as never);

      const result = await PowerShellTransport.isAvailable();
      expect(result).toBe(true);
    });

    it("returns false when PowerShell not found", async () => {
      mockExecFile.mockRejectedValueOnce(new Error("ENOENT"));

      const result = await PowerShellTransport.isAvailable();
      expect(result).toBe(false);
    });
  });

  describe("testConnection", () => {
    it("returns latency on success", async () => {
      mockExecFile.mockResolvedValueOnce({
        stdout: "---PWSH_STATUS---\n200\n---PWSH_STATUS_TEXT---\nOK\n---PWSH_HEADERS---\n\n---PWSH_BODY---\nok",
        stderr: "",
      } as never);

      const transport = new PowerShellTransport("http://proxy:8080");
      const latency = await transport.testConnection("https://www.google.com");
      expect(latency).toBeGreaterThanOrEqual(0);
    });

    it("accepts redirect responses (301, 302)", async () => {
      mockExecFile.mockResolvedValueOnce({
        stdout: "---PWSH_STATUS---\n302\n---PWSH_STATUS_TEXT---\nFound\n---PWSH_HEADERS---\nlocation: /new\n---PWSH_BODY---\n",
        stderr: "",
      } as never);

      const transport = new PowerShellTransport("http://proxy:8080");
      const latency = await transport.testConnection("https://example.com/old");
      expect(latency).toBeGreaterThanOrEqual(0);
    });

    it("throws on non-OK non-redirect response", async () => {
      mockExecFile.mockResolvedValueOnce({
        stdout: "---PWSH_STATUS---\n503\n---PWSH_STATUS_TEXT---\nService Unavailable\n---PWSH_HEADERS---\n\n---PWSH_BODY---\nblocked",
        stderr: "",
      } as never);

      const transport = new PowerShellTransport("http://proxy:8080");
      await expect(
        transport.testConnection("https://blocked.site.com")
      ).rejects.toThrow(/503/);
    });

    it("passes proxyUrl param to request when provided", async () => {
      mockExecFile.mockResolvedValueOnce({
        stdout: "---PWSH_STATUS---\n200\n---PWSH_STATUS_TEXT---\nOK\n---PWSH_HEADERS---\n\n---PWSH_BODY---\nok",
        stderr: "",
      } as never);

      const transport = new PowerShellTransport(null);
      const latency = await transport.testConnection("https://example.com", "http://alt-proxy:9999");
      expect(latency).toBeGreaterThanOrEqual(0);
    });
  });
});
