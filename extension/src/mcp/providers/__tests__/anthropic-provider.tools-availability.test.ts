/**
 * AnthropicProvider tests (split from anthropic-provider.test.ts).
 * Covers: tool calling, availability, and SEC-324-01 baseUrl validation.
 */
import { describe, it, expect, vi, afterEach } from "vitest";

const sdk = vi.hoisted(() => {
  let constructCount = 0;
  class MockAnthropic {
    messages = { create: vi.fn(), stream: vi.fn() };
    constructor(public opts: Record<string, any>) { constructCount++; }
  }
  return { MockAnthropic, getConstructCount: () => constructCount };
});

vi.mock("@anthropic-ai/sdk", () => ({ default: sdk.MockAnthropic }));

import { AnthropicProvider } from "../anthropic-provider";

const createOf = (provider: AnthropicProvider) => (provider as any).client.messages.create;

function providerWithCreate(response: unknown): AnthropicProvider {
  const provider = new AnthropicProvider(() => Promise.resolve("key"));
  (provider as any).client = { messages: { create: vi.fn().mockResolvedValue(response) } };
  return provider;
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("AnthropicProvider — chatWithTools", () => {
  it("shapes tools for the Anthropic schema and returns tool_use responses", async () => {
    const provider = providerWithCreate({
      content: [{ type: "tool_use", id: "t1", name: "read_file", input: { path: "a.ts" } }],
    });

    const res = await provider.chatWithTools(
      [{ role: "user", content: "read it" }],
      [{ name: "read_file", description: "Reads a file", inputSchema: { type: "object", properties: {} } }],
    );

    expect(res.type).toBe("tool_use");
    expect(res.toolCalls).toEqual([{ id: "t1", name: "read_file", arguments: { path: "a.ts" } }]);
    const params = createOf(provider).mock.calls[0][0];
    expect(params.tools).toEqual([
      { name: "read_file", description: "Reads a file", input_schema: { type: "object", properties: {} } },
    ]);
    expect(params.stream).toBe(false);
  });

  it("formats tool result messages into Anthropic tool_result blocks", async () => {
    const provider = providerWithCreate({ content: [{ type: "text", text: "done" }] });

    await provider.chatWithTools(
      [
        { role: "user", content: "read a.ts" },
        { role: "tool", content: "file body", toolCallId: "t2" },
      ],
      [],
    );

    const params = createOf(provider).mock.calls[0][0];
    expect(params.messages).toEqual([
      { role: "user", content: "read a.ts" },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "t2", content: "file body" }] },
    ]);
  });

  it("returns text responses when no tool_use blocks are present", async () => {
    const provider = providerWithCreate({ content: [{ type: "text", text: "plain answer" }] });

    const res = await provider.chatWithTools([{ role: "user", content: "hi" }], []);
    expect(res).toEqual({ type: "text", text: "plain answer" });
  });

  it("sends explicit options through to the request", async () => {
    const provider = providerWithCreate({ content: [{ type: "text", text: "ok" }] });

    await provider.chatWithTools(
      [{ role: "user", content: "hi" }],
      [],
      { model: "m", maxTokens: 5, temperature: 0.1 },
    );

    const params = createOf(provider).mock.calls[0][0];
    expect(params.model).toBe("m");
    expect(params.max_tokens).toBe(5);
    expect(params.temperature).toBe(0.1);
  });
});

describe("AnthropicProvider — availability", () => {
  it("returns false without pinging when not configured", async () => {
    const fetchMock = vi.fn(async () => ({ status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = new AnthropicProvider(() => Promise.resolve(undefined));
    await expect(provider.isAvailable()).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("pings /v1/messages with a POST health request and reports available", async () => {
    const fetchMock = vi.fn(async () => ({ status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = new AnthropicProvider(() => Promise.resolve("key"));

    await expect(provider.isAvailable()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("treats 5xx statuses as unavailable and 4xx as available", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 500 })));
    await expect(new AnthropicProvider(() => Promise.resolve("key")).isAvailable()).resolves.toBe(false);

    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 401 })));
    await expect(new AnthropicProvider(() => Promise.resolve("key")).isAvailable()).resolves.toBe(true);
  });

  it("reports unavailable when the health fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    await expect(new AnthropicProvider(() => Promise.resolve("key")).isAvailable()).resolves.toBe(false);
  });
});

describe("AnthropicProvider — SEC-324-01 baseUrl validation", () => {
  it("accepts the default and loopback-HTTP base URLs", () => {
    expect(() => new AnthropicProvider(() => Promise.resolve("k"))).not.toThrow();
    expect(() => new AnthropicProvider(() => Promise.resolve("k"), "http://localhost:11434")).not.toThrow();
    expect(() => new AnthropicProvider(() => Promise.resolve("k"), "https://gateway.example.com")).not.toThrow();
  });

  it("rejects non-loopback plain HTTP (key-exfiltration sink)", () => {
    expect(() => new AnthropicProvider(() => Promise.resolve("k"), "http://gateway:1234")).toThrow(
      /Insecure backend URL rejected/,
    );
  });

  it("rejects non-http(s) schemes", () => {
    expect(() => new AnthropicProvider(() => Promise.resolve("k"), "file:///etc/passwd")).toThrow();
    expect(() => new AnthropicProvider(() => Promise.resolve("k"), "ftp://localhost:21")).toThrow();
  });

  it("rejects cloud-metadata SSRF targets over plain HTTP", () => {
    expect(() => new AnthropicProvider(() => Promise.resolve("k"), "http://169.254.169.254")).toThrow();
  });
});
