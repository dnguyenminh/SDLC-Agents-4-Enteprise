/**
 * BaseLlmProvider tests — template-method health check (ping with timeout) and SSE/NDJSON stream reading.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BaseLlmProvider } from "../BaseLlmProvider";

class TestProvider extends BaseLlmProvider {
  readonly type = "test" as const;
  configured = true;
  healthUrl = "http://test.local/health";
  healthRequest: { method: string; headers?: Record<string, string>; body?: string } = { method: "GET" };
  isHealthy = (status: number): boolean => status >= 200 && status < 500;
  contextTokens = 4096;

  constructor() {
    super();
    this.contextWindowTokens = this.contextTokens;
  }

  async chat() { return ""; }
  async *chatStream() {} 
  dispose(): void {}

  protected async isConfigured(): Promise<boolean> { return this.configured; }
  protected getHealthCheckUrl(): string { return this.healthUrl; }
  protected async getHealthCheckRequest() { return this.healthRequest; }
  protected isHealthyStatus(status: number): boolean { return this.isHealthy(status); }

  public stream(response: any, extractToken: (parsed: any) => string | null): AsyncGenerator<string> {
    return this.readStream(response, extractToken);
  }
}

function stubFetch(impl: (url: string, init: RequestInit) => any): ReturnType<typeof vi.fn> {
  const mock = vi.fn(impl);
  vi.stubGlobal("fetch", mock);
  return mock;
}

function mockStreamResponse(chunks: string[]): any {
  let i = 0;
  return {
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

async function collect(gen: AsyncGenerator<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const token of gen) { out.push(token); }
  return out;
}

const extractContent = (parsed: any): string | null => parsed?.content ?? null;

beforeEach(() => { vi.restoreAllMocks(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("BaseLlmProvider — context window", () => {
  it("returns the configured context window tokens", () => {
    expect(new TestProvider().getContextWindow()).toBe(4096);
  });

  it("exposes contextWindowTokens as a protected overridable member", () => {
    const provider = new TestProvider();
    (provider as any).contextWindowTokens = 123;
    expect(provider.getContextWindow()).toBe(123);
  });
});

describe("BaseLlmProvider — isAvailable (template method)", () => {
  it("returns false without pinging when isConfigured is false", async () => {
    const fetchMock = stubFetch(async () => ({ status: 200 }));
    const provider = new TestProvider();
    provider.configured = false;
    await expect(provider.isAvailable()).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("pings the health URL and reports available for a healthy status", async () => {
    const fetchMock = stubFetch(async () => ({ status: 200 }));
    const provider = new TestProvider();
    await expect(provider.isAvailable()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("http://test.local/health", expect.objectContaining({ method: "GET" }));
  });

  it("reports unavailable when the healthy-status predicate fails", async () => {
    const fetchMock = stubFetch(async () => ({ status: 500 }));
    const provider = new TestProvider();
    await expect(provider.isAvailable()).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("honors a provider-specific healthy-status predicate", async () => {
    stubFetch(async () => ({ status: 204 }));
    const provider = new TestProvider();
    provider.isHealthy = (status) => status === 204;
    await expect(provider.isAvailable()).resolves.toBe(true);
  });

  it("passes the custom health-check request method, headers, and body", async () => {
    const fetchMock = stubFetch(async () => ({ status: 200 }));
    const provider = new TestProvider();
    provider.healthRequest = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"ping":true}',
    };
    await provider.isAvailable();
    const init = fetchMock.mock.calls[0][1] as any;
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(init.body).toBe('{"ping":true}');
  });

  it("returns false when the health fetch rejects", async () => {
    stubFetch(async () => { throw new Error("network down"); });
    const provider = new TestProvider();
    await expect(provider.isAvailable()).resolves.toBe(false);
  });
});

describe("BaseLlmProvider — readStream", () => {
  it("yields tokens across arbitrary chunk boundaries", async () => {
    const gen = new TestProvider().stream(
      mockStreamResponse(['data: {"co', 'ntent":"Hel"}', "\n", 'data: {"content":"lo!"}', "\n"]),
      extractContent,
    );
    expect(await collect(gen)).toEqual(["Hel", "lo!"]);
  });

  it("parses NDJSON lines without the 'data: ' prefix", async () => {
    const gen = new TestProvider().stream(mockStreamResponse(['{"content":"ndjson"}', "\n"]), extractContent);
    expect(await collect(gen)).toEqual(["ndjson"]);
  });

  it("stops at the [DONE] marker and drops trailing lines", async () => {
    const gen = new TestProvider().stream(
      mockStreamResponse(['data: {"content":"a"}', "\n", "data: [DONE]", "\n", 'data: {"content":"ignored"}', "\n"]),
      extractContent,
    );
    expect(await collect(gen)).toEqual(["a"]);
  });

  it("flushes the final buffer when the stream ends without a trailing newline", async () => {
    const gen = new TestProvider().stream(mockStreamResponse(['data: {"content":"tail"}']), extractContent);
    expect(await collect(gen)).toEqual(["tail"]);
  });

  it("skips malformed SSE lines without throwing", async () => {
    const gen = new TestProvider().stream(
      mockStreamResponse(["data: not-json", "\n", 'data: {"content":"ok"}', "\n"]),
      extractContent,
    );
    expect(await collect(gen)).toEqual(["ok"]);
  });

  it("skips blank lines and lines where extractToken returns null", async () => {
    const gen = new TestProvider().stream(
      mockStreamResponse(["\n", 'data: {"other":"x"}', "\n", 'data: {"content":""}', "\n"]),
      extractContent,
    );
    expect(await collect(gen)).toEqual([]);
  });

  it("throws a descriptive error when the response has no body", async () => {
    const gen = new TestProvider().stream({}, extractContent);
    await expect(gen.next()).rejects.toThrow("No response body for streaming");
  });
});