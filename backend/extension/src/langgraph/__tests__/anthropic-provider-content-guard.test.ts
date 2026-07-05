/**
 * AnthropicProvider content-guard tests — KSA-237 (Chat Panel BUG 1)
 *
 * Root cause: when the upstream returns a body WITHOUT a `content` array
 * (error shape, streaming-only payload, or a non-standard gateway response),
 * `response.content.filter(...)` threw
 * "Cannot read properties of undefined (reading 'filter')".
 *
 * These tests verify the provider no longer crashes and degrades gracefully.
 */
import { describe, it, expect, vi } from "vitest";
import { AnthropicProvider } from "../providers/anthropic-provider";

/** Build a provider whose underlying SDK client returns a canned response. */
function providerReturning(response: unknown): AnthropicProvider {
  const provider = new AnthropicProvider(() => Promise.resolve("test-key"));
  // Bypass real SDK by stubbing the cached client via the private field.
  (provider as any).client = {
    messages: {
      create: vi.fn().mockResolvedValue(response),
    },
  };
  return provider;
}

describe("AnthropicProvider — content guard (BUG 1)", () => {
  it("chat() returns empty string when response has no content array", async () => {
    const provider = providerReturning({ id: "msg", role: "assistant" });
    const text = await provider.chat([{ role: "user", content: "hi" }]);
    expect(text).toBe("");
  });

  it("chat() handles null content without throwing", async () => {
    const provider = providerReturning({ content: null });
    await expect(provider.chat([{ role: "user", content: "hi" }])).resolves.toBe("");
  });

  it("chat() still extracts text from a well-formed response", async () => {
    const provider = providerReturning({
      content: [
        { type: "text", text: "Hello" },
        { type: "text", text: " world" },
      ],
    });
    const text = await provider.chat([{ role: "user", content: "hi" }]);
    expect(text).toBe("Hello world");
  });

  it("chatWithTools() returns empty text when content is missing", async () => {
    const provider = providerReturning({ stop_reason: "end_turn" });
    const res = await provider.chatWithTools([{ role: "user", content: "hi" }], []);
    expect(res).toEqual({ type: "text", text: "" });
  });

  it("chatWithTools() parses tool_use blocks from a valid response", async () => {
    const provider = providerReturning({
      content: [
        { type: "tool_use", id: "t1", name: "read_file", input: { path: "a.ts" } },
      ],
    });
    const res = await provider.chatWithTools([{ role: "user", content: "hi" }], []);
    expect(res.type).toBe("tool_use");
    expect(res.toolCalls?.[0]).toEqual({
      id: "t1",
      name: "read_file",
      arguments: { path: "a.ts" },
    });
  });

  // KSA-237 root cause: the SDK omitted `stream`, so a gateway base URL
  // defaulted to SSE and returned text/event-stream. The SDK then could not
  // parse it as JSON -> empty content -> chat bubble showed only "active".
  // These tests lock in the explicit non-streaming request.
  it("chat() sends stream:false so the gateway returns a single JSON body", async () => {
    const create = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "ok" }] });
    const provider = new AnthropicProvider(() => Promise.resolve("test-key"));
    (provider as any).client = { messages: { create } };

    await provider.chat([{ role: "user", content: "hi" }]);

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toMatchObject({ stream: false });
  });

  it("chatWithTools() sends stream:false so the gateway returns a single JSON body", async () => {
    const create = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "ok" }] });
    const provider = new AnthropicProvider(() => Promise.resolve("test-key"));
    (provider as any).client = { messages: { create } };

    await provider.chatWithTools([{ role: "user", content: "hi" }], []);

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toMatchObject({ stream: false });
  });
});
