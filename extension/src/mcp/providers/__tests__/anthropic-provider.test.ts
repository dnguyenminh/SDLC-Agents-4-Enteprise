/**
 * AnthropicProvider tests — request payload shaping, response parsing, streaming, tool calling, and availability.
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

const clientOf = (provider: AnthropicProvider) => (provider as any).client;

const createOf = (provider: AnthropicProvider) => (provider as any).client.messages.create;

function providerWithCreate(response: unknown): AnthropicProvider {
  const provider = new AnthropicProvider(() => Promise.resolve("key"));
  (provider as any).client = { messages: { create: vi.fn().mockResolvedValue(response) } };
  return provider;
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("AnthropicProvider — chat request shaping", () => {
  it("lazily builds the SDK client with the API key and sends a non-streaming messages.create", async () => {
    const provider = new AnthropicProvider(() => Promise.resolve("test-key"));

    const text = await provider.chat([{ role: "user", content: "hi" }]);

    const client = clientOf(provider);
    expect(text).toBe("");
    expect((client as any).opts).toEqual({ apiKey: "test-key" });
    expect(provider.getContextWindow()).toBe(200000);
    const params = client.messages.create.mock.calls[0][0];
    expect(params).toMatchObject({
      model: "claude-sonnet-4-latest",
      max_tokens: 4096,
      stream: false,
      messages: [{ role: "user", content: "hi" }],
    });
  });

  it("splits system messages out of the messages payload", async () => {
    const provider = new AnthropicProvider(() => Promise.resolve("k"));

    const out = await provider.chat([
      { role: "system", content: "Be direct" },
      { role: "user", content: "hi" },
    ]);

    const params = clientOf(provider).messages.create.mock.calls[0][0];
    expect(params.system).toBe("Be direct");
    expect(params.messages).toEqual([{ role: "user", content: "hi" }]);
    expect(out).toBe("");
  });

  it("applies options for model, max tokens, and temperature", async () => {
    const provider = new AnthropicProvider(() => Promise.resolve("k"));
    await provider.chat([{ role: "user", content: "hi" }], {
      model: "claude-opus-4",
      maxTokens: 999,
      temperature: 0.2,
    });

    const params = clientOf(provider).messages.create.mock.calls[0][0];
    expect(params.model).toBe("claude-opus-4");
    expect(params.max_tokens).toBe(999);
    expect(params.temperature).toBe(0.2);
  });

  it("reuses the cached client across calls", async () => {
    const provider = new AnthropicProvider(() => Promise.resolve("k"));
    await provider.chat([{ role: "user", content: "hi" }]);
    const client = clientOf(provider);
    await provider.chat([{ role: "user", content: "bye" }]);
    expect(clientOf(provider)).toBe(client);
    expect(client.messages.create).toHaveBeenCalledTimes(2);
  });

  it("throws a clear error when no API key and no custom base URL are configured", async () => {
    const provider = new AnthropicProvider(() => Promise.resolve(undefined));
    await expect(provider.chat([{ role: "user", content: "hi" }])).rejects.toThrow(
      "Anthropic API key not configured.",
    );
  });

  it("passes apiKey 'not-needed' and baseURL for custom gateways without a key", async () => {
    const provider = new AnthropicProvider(() => Promise.resolve(undefined), "https://gateway:1234");
    await provider.chat([{ role: "user", content: "hi" }]);
    expect(clientOf(provider).opts).toEqual({ baseURL: "https://gateway:1234", apiKey: "not-needed" });
  });

  it("strips trailing slashes from the base URL", async () => {
    const provider = new AnthropicProvider(() => Promise.resolve("k"), "https://gateway:1234/");
    await provider.chat([{ role: "user", content: "hi" }]);
    expect(clientOf(provider).opts.baseURL).toBe("https://gateway:1234");
  });

  it("parses text blocks from the response content array", async () => {
    const provider = providerWithCreate({
      content: [
        { type: "text", text: "Hello" },
        { type: "text", text: " world" },
      ],
    });
    const text = await provider.chat([{ role: "user", content: "hi" }]);
    expect(text).toBe("Hello world");
  });

  it("dispose() clears the cached client", async () => {
    const provider = new AnthropicProvider(() => Promise.resolve("k"));
    await provider.chat([{ role: "user", content: "hi" }]);
    expect(clientOf(provider)).toBeTruthy();
    provider.dispose();
    expect(clientOf(provider)).toBeNull();
  });
});

describe("AnthropicProvider — chatStream", () => {
  async function* events() {
    yield { type: "content_block_delta", delta: { text: "Hello" } };
    yield { type: "content_block_delta", delta: { text: " world" } };
    yield { type: "message_stop" };
  }

  it("yields only text deltas from the streaming API", async () => {
    const provider = new AnthropicProvider(() => Promise.resolve("k"));
    const stream = vi.fn().mockImplementation(events);
    (provider as any).client = { messages: { create: vi.fn(), stream } };

    const tokens: string[] = [];
    for await (const token of provider.chatStream([{ role: "user", content: "hi" }])) { tokens.push(token); }

    expect(tokens).toEqual(["Hello", " world"]);
    expect(stream).toHaveBeenCalledWith(expect.objectContaining({ stream: true }));
  });

  it("ignores non-text stream events", async () => {
    async function* mixedEvents() {
      yield { type: "message_start" };
      yield { type: "content_block_delta", delta: {} };
      yield { type: "content_block_delta", delta: { text: "only" } };
    }
    const provider = new AnthropicProvider(() => Promise.resolve("k"));
    const stream = vi.fn().mockImplementation(mixedEvents);
    (provider as any).client = { messages: { create: vi.fn(), stream } };

    const tokens: string[] = [];
    for await (const token of provider.chatStream([{ role: "user", content: "hi" }])) { tokens.push(token); }
    expect(tokens).toEqual(["only"]);
  });
});

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