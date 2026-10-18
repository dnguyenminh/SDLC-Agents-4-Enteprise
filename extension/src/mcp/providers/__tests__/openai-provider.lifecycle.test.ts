/**
 * OpenAIProvider tests (split from openai-provider.test.ts).
 * Covers: availability, model detection, context window, baseUrl validation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OpenAIProvider } from "../openai-provider";

function jsonResponse(body: unknown, status = 200): any {
  return { ok: status >= 200 && status < 400, status, json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)) };
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
