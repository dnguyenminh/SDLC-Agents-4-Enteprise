/**
 * SA4E-370 — detectLocalContextWindow fallback chain tests.
 * Precedence: context_length → meta.n_ctx → status.args --ctx-size.
 * All failures are non-fatal (return undefined).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { detectLocalContextWindow } from "../openai-model-detect";

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

describe("detectLocalContextWindow", () => {
  // (a) meta.n_ctx parsed
  it("parses meta.n_ctx from the first model entry", async () => {
    stubFetch(async () => ({
      ok: true,
      json: async () => ({ data: [{ id: "qwen-7b", meta: { n_ctx: 131072 } }] }),
    }));
    await expect(detectLocalContextWindow("http://localhost:1234/v1")).resolves.toBe(131072);
  });

  // (b) context_length takes precedence over meta.n_ctx and --ctx-size
  it("prefers context_length over meta.n_ctx and status.args", async () => {
    stubFetch(async () => ({
      ok: true,
      json: async () => ({
        data: [{
          id: "qwen-7b",
          context_length: 32768,
          meta: { n_ctx: 131072 },
          status: { args: ["--ctx-size", "4096"] },
        }],
      }),
    }));
    await expect(detectLocalContextWindow("http://localhost:1234/v1")).resolves.toBe(32768);
  });

  // (c) --ctx-size args fallback parsed when meta/context_length missing
  it("falls back to the --ctx-size launcher arg (LM Studio gateway shape)", async () => {
    stubFetch(async () => ({
      ok: true,
      json: async () => ({
        data: [{
          id: "qwen-7b",
          status: { args: ["--jinja", "--ctx-size", "131072", "--port", "1234"] },
        }],
      }),
    }));
    await expect(detectLocalContextWindow("http://localhost:1234/v1")).resolves.toBe(131072);
  });

  // (c-edges) malformed args shapes must not yield a window
  it("ignores a --ctx-size flag without a following value or a non-positive value", async () => {
    stubFetch(async () => ({
      ok: true,
      json: async () => ({ data: [{ id: "m", status: { args: ["--ctx-size"] } }] }),
    }));
    await expect(detectLocalContextWindow("http://localhost:1234/v1")).resolves.toBeUndefined();

    stubFetch(async () => ({
      ok: true,
      json: async () => ({ data: [{ id: "m", status: { args: ["--ctx-size", "0"] } }] }),
    }));
    await expect(detectLocalContextWindow("http://localhost:1234/v1")).resolves.toBeUndefined();
  });

  // (d) returns undefined when nothing usable
  it("returns undefined when the payload has no usable context fields", async () => {
    stubFetch(async () => ({
      ok: true,
      json: async () => ({ data: [{ id: "qwen-7b" }] }),
    }));
    await expect(detectLocalContextWindow("http://localhost:1234/v1")).resolves.toBeUndefined();
  });

  // (e) fetch rejection → undefined (non-fatal)
  it("returns undefined when fetch rejects (non-fatal)", async () => {
    stubFetch(async () => {
      throw new Error("connection refused");
    });
    await expect(detectLocalContextWindow("http://localhost:1234/v1")).resolves.toBeUndefined();
  });

  it("returns undefined for a non-ok response", async () => {
    stubFetch(async () => ({ ok: false, status: 500 }));
    await expect(detectLocalContextWindow("http://localhost:1234/v1")).resolves.toBeUndefined();
  });
});
