/**
 * AnthropicProvider tests (split from anthropic-provider.test.ts).
 * Covers: request payload shaping and streaming.
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
