/**
 * SEC-324-01 — unit tests for the shared provider baseUrl policy.
 */
import { describe, it, expect } from "vitest";
import { validateProviderBaseUrl } from "../provider-url-policy";

describe("validateProviderBaseUrl (SEC-324-01)", () => {
  it("accepts loopback HTTP for local development", () => {
    expect(validateProviderBaseUrl("http://localhost:11434")).toBe("http://localhost:11434");
    expect(validateProviderBaseUrl("http://127.0.0.1:8990/anthropic")).toBe(
      "http://127.0.0.1:8990/anthropic",
    );
  });

  it("accepts HTTPS remote URLs (custom gateways)", () => {
    expect(validateProviderBaseUrl("https://gateway.example.com/v1")).toBe(
      "https://gateway.example.com/v1",
    );
  });

  it("rejects non-loopback plain HTTP (SSRF + key-exfiltration sink)", () => {
    expect(() => validateProviderBaseUrl("http://gateway:1234")).toThrow(
      /Insecure backend URL rejected/,
    );
    expect(() => validateProviderBaseUrl("http://169.254.169.254")).toThrow();
  });

  it("rejects non-http(s) schemes", () => {
    expect(() => validateProviderBaseUrl("file:///etc/passwd")).toThrow();
    expect(() => validateProviderBaseUrl("ftp://localhost:21")).toThrow();
    expect(() => validateProviderBaseUrl("gopher://localhost:70")).toThrow();
  });

  it("rejects empty and malformed URLs (fail-closed)", () => {
    expect(() => validateProviderBaseUrl("")).toThrow();
    expect(() => validateProviderBaseUrl("not a valid url")).toThrow();
  });
});
