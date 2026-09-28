/**
 * OllamaProvider tests — request shaping, response parsing, streaming, availability, and context detection.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OllamaProvider } from "../ollama-provider";

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

describe("OllamaProvider — chat", () => {
  it("shapes the /api/chat request and parses the assistant message", async () => {
    const fetchMock = stubFetch(async (url: string, init: any) => {
      expect(url).toBe("http://localhost:11434/api/chat");
      const body = JSON.parse(init.body);
      expect(body).toMatchObject({ model: "llama3.1", stream: false, messages: [{ role: "user", content: "hi" }] });
      expect(init.headers).toEqual({ "Content-Type": "application/json" });
      return jsonResponse({ message: { content: "Hello Ollama" } });
    });

    const provider = new OllamaProvider();
    await expect(provider.chat([{ role: "user", content: "hi" }])).resolves.toBe("Hello Ollama");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("honors custom base URL, model override, and temperature options", async () => {
    const fetchMock = stubFetch(async (url: string, init: any) => {
      expect(url).toBe("http://localhost:1234/api/chat");
      const body = JSON.parse(init.body);
      expect(body.model).toBe("llama2");
      expect(body.options).toEqual({ temperature: 0.8 });
      return jsonResponse({ message: { content: "ok" } });
    });

    const provider = new OllamaProvider("http://localhost:1234");
    await provider.chat([{ role: "user", content: "hi" }], { model: "llama2", temperature: 0.8 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws a descriptive error on HTTP failures", async () => {
    stubFetch(async () => ({ ok: false, status: 404, text: async () => "model not found", json: async () => ({}) }));
    const provider = new OllamaProvider();
    await expect(provider.chat([{ role: "user", content: "hi" }])).rejects.toThrow(
      "Ollama API error 404: model not found",
    );
  });

  it("fixes the default context window to 8192", () => {
    expect(new OllamaProvider().getContextWindow()).toBe(8192);
  });
});

describe("OllamaProvider — chatStream", () => {
  it("yields incremental content tokens from SSE lines", async () => {
    stubFetch(async () => streamResponse([
      'data: {"message":{"content":"It"}}',
      "\n",
      'data: {"message":{"content":" works"}}',
      "\n",
      "data: [DONE]",
      "\n",
    ]));

    const provider = new OllamaProvider();
    const tokens: string[] = [];
    for await (const token of provider.chatStream([{ role: "user", content: "hi" }])) { tokens.push(token); }
    expect(tokens).toEqual(["It", " works"]);
  });
});

describe("OllamaProvider — availability", () => {
  it("pings /api/tags and reports available on HTTP 200", async () => {
    const fetchMock = stubFetch(async (url: string, init: any) => {
      expect(url).toBe("http://localhost:11434/api/tags");
      expect(init.method).toBe("GET");
      return { status: 200 };
    });
    const provider = new OllamaProvider();
    await expect(provider.isAvailable()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports unavailable for any non-200 status", async () => {
    stubFetch(async () => ({ status: 404 }));
    await expect(new OllamaProvider().isAvailable()).resolves.toBe(false);
  });

  it("reports unavailable when the health fetch rejects", async () => {
    stubFetch(async () => { throw new Error("down"); });
    await expect(new OllamaProvider().isAvailable()).resolves.toBe(false);
  });
});

describe("OllamaProvider — detectContextWindow", () => {
  it("updates the context window from /api/show model_info", async () => {
    stubFetch(async (_url: string, init: any) => {
      expect(JSON.parse(init.body)).toEqual({ name: "llama3.1" });
      return jsonResponse({ model_info: { "context_length": 16384, "llama.context_length": 32768 } });
    });

    const provider = new OllamaProvider();
    await provider.detectContextWindow();
    expect(provider.getContextWindow()).toBe(16384);
  });

  it("falls back to the llama-specific key when context_length is absent", async () => {
    stubFetch(async () => jsonResponse({ model_info: { "llama.context_length": 32768 } }));
    const provider = new OllamaProvider();
    await provider.detectContextWindow();
    expect(provider.getContextWindow()).toBe(32768);
  });

  it("keeps the default when detection fails", async () => {
    stubFetch(async () => { throw new Error("boom"); });
    const provider = new OllamaProvider();
    await provider.detectContextWindow();
    expect(provider.getContextWindow()).toBe(8192);
  });
});

describe("OllamaProvider — chatWithTools", () => {
  it("delegates tool requests to the Ollama tool adapter and parses tool calls", async () => {
    stubFetch(async (url: string) => {
      expect(url).toBe("http://localhost:11434/api/chat");
      return jsonResponse({
        message: {
          content: "",
          tool_calls: [{ function: { name: "read_file", arguments: { path: "a.ts" } } }],
        },
      });
    });

    const provider = new OllamaProvider();
    const res = await provider.chatWithTools(
      [{ role: "user", content: "read it" }],
      [{ name: "read_file", description: "Reads a file", inputSchema: { type: "object" } }],
    );

    expect(res.type).toBe("tool_use");
    expect(res.toolCalls?.[0]).toMatchObject({ name: "read_file", arguments: { path: "a.ts" } });
  });
});

describe("OllamaProvider — SEC-324-01 baseUrl validation", () => {
  it("accepts the default loopback and HTTPS remote base URLs", () => {
    expect(() => new OllamaProvider()).not.toThrow();
    expect(() => new OllamaProvider("http://localhost:1234")).not.toThrow();
    expect(() => new OllamaProvider("https://ollama.corp.example.com")).not.toThrow();
  });

  it("rejects non-loopback plain HTTP", () => {
    expect(() => new OllamaProvider("http://ollama.corp.example.com")).toThrow(
      /Insecure backend URL rejected/,
    );
  });

  it("rejects non-http(s) schemes", () => {
    expect(() => new OllamaProvider("file:///tmp/ollama")).toThrow();
  });
});