/**
 * Unit tests for PowerShellTransport — output parsing and error
 * interpretation.
 * (Split from powershell-transport.test.ts — request/parse/error concern.)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock child_process before importing module
vi.mock("child_process", () => ({
  execFile: vi.fn(),
}));
vi.mock("util", () => ({
  promisify: (fn: unknown) => fn,
}));

import { PowerShellTransport, PowerShellTransportError } from "../proxy/PowerShellTransport";
import { execFile } from "child_process";

const mockExecFile = vi.mocked(execFile);

describe("PowerShellTransport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("parseOutput", () => {
    it("parses successful response with status, headers, body", async () => {
      const mockOutput = [
        "---PWSH_STATUS---",
        "200",
        "---PWSH_STATUS_TEXT---",
        "OK",
        "---PWSH_HEADERS---",
        "content-type: application/json",
        "x-request-id: abc123",
        "---PWSH_BODY---",
        '{"result":"success"}',
      ].join("\n");

      mockExecFile.mockResolvedValueOnce({ stdout: mockOutput, stderr: "" } as never);

      const transport = new PowerShellTransport(null);
      const response = await transport.request("https://example.com/api");

      expect(response.status).toBe(200);
      expect(response.statusText).toBe("OK");
      expect(response.ok).toBe(true);
      expect(response.headers["content-type"]).toBe("application/json");
      expect(response.headers["x-request-id"]).toBe("abc123");
      expect(response.body).toBe('{"result":"success"}');
    });

    it("parses error response (404)", async () => {
      const mockOutput = [
        "---PWSH_STATUS---",
        "404",
        "---PWSH_STATUS_TEXT---",
        "Not Found",
        "---PWSH_HEADERS---",
        "",
        "---PWSH_BODY---",
        "Resource not found",
      ].join("\n");

      mockExecFile.mockResolvedValueOnce({ stdout: mockOutput, stderr: "" } as never);

      const transport = new PowerShellTransport("http://proxy:8080");
      const response = await transport.request("https://example.com/missing");

      expect(response.status).toBe(404);
      expect(response.ok).toBe(false);
      expect(response.body).toBe("Resource not found");
    });

    it("parses response with empty body", async () => {
      const mockOutput = [
        "---PWSH_STATUS---",
        "204",
        "---PWSH_STATUS_TEXT---",
        "No Content",
        "---PWSH_HEADERS---",
        "",
        "---PWSH_BODY---",
        "",
      ].join("\n");

      mockExecFile.mockResolvedValueOnce({ stdout: mockOutput, stderr: "" } as never);

      const transport = new PowerShellTransport(null);
      const response = await transport.request("https://example.com/delete", { method: "DELETE" });

      expect(response.status).toBe(204);
      expect(response.ok).toBe(true);
      expect(response.body).toBe("");
    });

    it("handles Windows CRLF line endings", async () => {
      const mockOutput =
        "---PWSH_STATUS---\r\n200\r\n---PWSH_STATUS_TEXT---\r\nOK\r\n---PWSH_HEADERS---\r\ncontent-type: text/plain\r\n---PWSH_BODY---\r\nhello world";

      mockExecFile.mockResolvedValueOnce({ stdout: mockOutput, stderr: "" } as never);

      const transport = new PowerShellTransport(null);
      const response = await transport.request("https://example.com");

      expect(response.status).toBe(200);
      expect(response.body).toBe("hello world");
    });
  });

  describe("error handling", () => {
    it("throws PowerShellTransportError on exec failure", async () => {
      const error = new Error("timeout") as Error & { stderr: string };
      error.stderr = "Invoke-WebRequest: Operation timed out";
      mockExecFile.mockRejectedValueOnce(error);

      const transport = new PowerShellTransport("http://proxy:9090");
      await expect(
        transport.request("https://example.com")
      ).rejects.toThrow(PowerShellTransportError);
    });

    it("interprets 407 error correctly", async () => {
      const error = new Error("fail") as Error & { stderr: string };
      error.stderr = "407 Proxy Authentication Required";
      mockExecFile.mockRejectedValueOnce(error);

      const transport = new PowerShellTransport("http://proxy:9090");
      await expect(
        transport.request("https://example.com")
      ).rejects.toThrow(/Proxy authentication failed/);
    });

    it("interprets timeout error correctly", async () => {
      const error = new Error("fail") as Error & { stderr: string };
      error.stderr = "The operation has timed out";
      mockExecFile.mockRejectedValueOnce(error);

      const transport = new PowerShellTransport("http://proxy:9090");
      await expect(
        transport.request("https://example.com")
      ).rejects.toThrow(/timed out/);
    });

    it("interprets 503 error correctly", async () => {
      const error = new Error("fail") as Error & { stderr: string };
      error.stderr = "503 Service Unavailable";
      mockExecFile.mockRejectedValueOnce(error);

      const transport = new PowerShellTransport("http://proxy:9090");
      await expect(
        transport.request("https://example.com")
      ).rejects.toThrow(/503/);
    });
  });
});
