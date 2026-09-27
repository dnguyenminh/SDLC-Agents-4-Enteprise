/**
 * OpenAIProvider tests — request shaping, response parsing, tool calling, streaming, availability, and model detection.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OpenAIProvider } from "../openai-provider";

function jsonResponse(body: unknown, status = 200): any {
  return { ok: status >= 200 && status < 400, status, json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)) };
}

function streamResponse(chunks: string[]): any {
  let i = 0;
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: async () => (i < chunks.length
          ? { done: false, value: new TextEncoder().encode(chunks[i++]) }
          : { done: true, value: undefined }),
        releaseLock: () => {},
      }),
    },
  };
}

const CHAT_URL = "https://api.openai.com/v1/chat/completions";

function stubFetch(impl: (url: string, init: any) => any): ReturnType<typeof vi.fn> {
  const mock = vi.fn(impl);
  vi.stubGlobal("fetch", mock);
  return mock;
}

beforeEach(() => {
  vi.spyOn(AbortSignal, "timeout").mockReturnValue(undefined as unknown as AbortSignal);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("OpenAIProvider — chat", () => {
  it("shapes the chat completions request and parses the assistant content", async () => {
    const fetchMock = stubFetch(async (url: string, init: any) => {
      expect(url).toBe(CHAT_URL);
      const body = JSON.parse(init.body);
      expect(body).toMatchObject({ model: "gpt-4o", stream: false, max_tokens: 4096 });
      expect(init.headers).toEqual({ "Content-Type": "application/json", Authorization: "Bearer test-key" });
      return jsonResponse({ choices: [{ message: { content: "Hello!" } }] });
    });

    const provider = new OpenAIProvider(() => Promise.resolve("test-key"));
    await expect(provider.chat([{ role: "user", content: "hi" }])).resolves.toBe("Hello!");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("applies model, maxTokens, and temperature options", async () => {
    stubFetch(async (_url: string, init: any) => {
      const body = JSON.parse(init.body);
      expect(body.model).toBe("gpt-4-turbo");
      expect(body.max_tokens).toBe(2048);
      expect(body.temperature).toBe(0.1);
      return jsonResponse({ choices: [{ message: { content: "ok" } }] });
    });

    const provider = new OpenAIProvider(() => Promise.resolve("k"));
    await provider.chat([{ role: "user", content: "hi" }], { model: "gpt-4-turbo", maxTokens: 2048, temperature: 0.1 });
  });

  it("throws a descriptive error on HTTP failures", async () => {
    stubFetch(async () => ({ ok: false, status: 401, text: async () => "bad key", json: async () => ({}) }));
    const provider = new OpenAIProvider(() => Promise.resolve("k"));
    await expect(provider.chat([{ role: "user", content: "hi" }])).rejects.toThrow("OpenAI API error 401: bad key");
  });

  it("returns an empty string when choices are missing", async () => {
    stubFetch(async () => jsonResponse({ choices: [] }));
    const provider = new OpenAIProvider(() => Promise.resolve("k"));
    await expect(provider.chat([{ role: "user", content: "hi" }])).resolves.toBe("");
  });

  it("throws when no API key is available for the default endpoint", async () => {
    const provider = new OpenAIProvider(() => Promise.resolve(undefined));
    await expect(provider.chat([{ role: "user", content: "hi" }])).rejects.toThrow("OpenAI API key not configured.");
  });
});

describe("OpenAIProvider — chatStream", () => {
  it("yields incremental delta content from SSE lines", async () => {
    stubFetch(async () => streamResponse([
      'data: {"choices":[{"delta":{"content":"Hel"}}]}',
      "\n",
      'data: {"choices":[{"delta":{"content":"lo"}}]}',
      "\n",
      "data: [DONE]",
      "\n",
    ]));

    const provider = new OpenAIProvider(() => Promise.resolve("k"));
    const tokens: string[] = [];
    for await (const token of provider.chatStream([{ role: "user", content: "hi" }], { maxTokens: 100 })) {
      tokens.push(token);
    }
    expect(tokens).toEqual(["Hel", "lo"]);
  });
});

describe("OpenAIProvider — chatWithTools", () => {
  it("shapes tools and messages and parses tool_calls into structured calls", async () => {
    const fetchMock = stubFetch(async (url: string, init: any) => {
      expect(url).toBe(CHAT_URL);
      const body = JSON.parse(init.body);
      expect(body.tools).toEqual([
        { type: "function", function: { name: "search", description: "Search", parameters: { type: "object" } } },
      ]);
      expect(body.messages).toEqual([{ role: "user", content: "find docs" }]);
      return jsonResponse({
        choices: [{
          message: {
            content: null,
            tool_calls: [{ id: "call_1", type: "function", function: { name: "search", arguments: "{\"q\":\"docs\"}" } }],
          },
        }],
      });
    });

    const provider = new OpenAIProvider(() => Promise.resolve("k"));
    const res = await provider.chatWithTools(
      [{ role: "user", content: "find docs" }],
      [{ name: "search", description: "Search", inputSchema: { type: "object" } }],
    );

    expect(res.type).toBe("tool_use");
    expect(res.toolCalls).toEqual([{ id: "call_1", name: "search", arguments: { q: "docs" } }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("survives malformed tool call arguments with empty args and a warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    stubFetch(async () => jsonResponse({
      choices: [{ message: { tool_calls: [{ id: "c", function: { name: "f", arguments: "{oops" } }] } }],
    }));

    const provider = new OpenAIProvider(() => Promise.resolve("k"));
    const res = await provider.chatWithTools([{ role: "user", content: "x" }], []);

    expect(res.type).toBe("tool_use");
    expect(res.toolCalls?.[0]).toEqual({ id: "c", name: "f", arguments: {} });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("returns a text response when no tool_calls are present", async () => {
    stubFetch(async () => jsonResponse({ choices: [{ message: { content: "plain" } }] }));
    const provider = new OpenAIProvider(() => Promise.resolve("k"));
    const res = await provider.chatWithTools([{ role: "user", content: "hi" }], []);
    expect(res).toEqual({ type: "text", text: "plain" });
  });
});

describe("OpenAIProvider — availability", () => {
  it("pings /chat/completions and treats 429 as available for cloud providers", async () => {
    const fetchMock = stubFetch(async (url: string, init: any) => {
      expect(url).toBe(CHAT_URL);
      expect(init.method).toBe("POST");
      return { status: 429 };
    });
    const provider = new OpenAIProvider(() => Promise.resolve("k"));
    await expect(provider.isAvailable()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("pings /models and requires exactly 200 for local servers", async () => {
    const fetchMock = stubFetch(async (url: string, init: any) => {
      expect(url).toBe("http://localhost:1234/v1/models");
      expect(init.method).toBe("GET");
      return { status: 200 };
    });
    const provider = new OpenAIProvider(() => Promise.resolve("k"), "http://localhost:1234/v1");
    await expect(provider.isAvailable()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    stubFetch(async () => ({ status: 500 }));
    await expect(new OpenAIProvider(() => Promise.resolve("k"), "http://localhost:1234/v1").isAvailable()).resolves.toBe(false);
  });

  it("returns false without pinging when not configured", async () => {
    const fetchMock = stubFetch(async () => ({ status: 200 }));
    const provider = new OpenAIProvider(() => Promise.resolve(undefined));
    await expect(provider.isAvailable()).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("OpenAIProvider — model detection", () => {
  it("detects the first loaded model for local servers", async () => {
    const fetchMock = stubFetch(async (url: string) => {
      if (url.endsWith("/models")) { return jsonResponse({ data: [{ id: "qwen-7b", context_length: 32768 }] }); }
      return jsonResponse({ choices: [{ message: { content: "done" } }] });
    });

    const provider = new OpenAIProvider(() => Promise.resolve("k"), "http://localhost:1234/v1", "local-model");
    await expect(provider.chat([{ role: "user", content: "hi" }])).resolves.toBe("done");

    const chatCall = fetchMock.mock.calls.find(([url]) => url.endsWith("/chat/completions"))!;
    expect(JSON.parse(chatCall[1].body).model).toBe("qwen-7b");
  });

  it("uses the explicit model override without detecting", async () => {
    const fetchMock = stubFetch(async (url: string) => {
      expect(url).not.toContain("/models");
      return jsonResponse({ choices: [{ message: { content: "done" } }] });
    });
    const provider = new OpenAIProvider(() => Promise.resolve("k"), "http://localhost:1234/v1", "local-model");
    await provider.chat([{ role: "user", content: "hi" }], { model: "explicit-7b" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("OpenAIProvider — context window", () => {
  it("uses cloud defaults and skips detection for the default endpoint", async () => {
    const fetchMock = stubFetch(async () => jsonResponse({ data: [] }));
    const provider = new OpenAIProvider(() => Promise.resolve("k"));
    expect(provider.getContextWindow()).toBe(128000);
    await provider.detectContextWindow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses local defaults and updates from the models endpoint for local servers", async () => {
    const fetchMock = stubFetch(async () => jsonResponse({ data: [{ id: "m", context_length: 32000 }] }));
    const provider = new OpenAIProvider(() => Promise.resolve("k"), "http://localhost:1234/v1");
    expect(provider.getContextWindow()).toBe(8192);
    await provider.detectContextWindow();
    expect(provider.getContextWindow()).toBe(32000);
    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:1234/v1/models");
  });
});

describe("OpenAIProvider — SEC-324-01 baseUrl validation", () => {
  it("accepts the default, loopback-HTTP, and HTTPS remote base URLs", () => {
    expect(() => new OpenAIProvider(() => Promise.resolve("k"))).not.toThrow();
    expect(() => new OpenAIProvider(() => Promise.resolve("k"), "http://localhost:1234/v1")).not.toThrow();
    expect(() => new OpenAIProvider(() => Promise.resolve("k"), "https://api.openai.com/v1")).not.toThrow();
  });

  it("rejects non-loopback plain HTTP (Bearer-key exfiltration sink)", () => {
    expect(() => new OpenAIProvider(() => Promise.resolve("k"), "http://evil.example.com/v1")).toThrow(
      /Insecure backend URL rejected/,
    );
  });

  it("rejects non-http(s) schemes", () => {
    expect(() => new OpenAIProvider(() => Promise.resolve("k"), "gopher://localhost:70")).toThrow();
    expect(() => new OpenAIProvider(() => Promise.resolve("k"), "file:///etc/hosts")).toThrow();
  });
});