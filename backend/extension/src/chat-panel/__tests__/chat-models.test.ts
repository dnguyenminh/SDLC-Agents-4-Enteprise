/**
 * Chat Panel model catalog tests — KSA-237 (Chat Panel BUG 2)
 *
 * Verifies the provider-aware model catalog and gateway fetch fallback that
 * back the dynamic Chat Panel model dropdown (replacing the old hardcoded
 * mixed list of providers + models).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  AVAILABLE_MODELS,
  getStaticModels,
  getDefaultModel,
  fetchGatewayModels,
} from "../chat-models";

describe("chat-models catalog (BUG 2)", () => {
  it("returns provider-specific models, not a mixed list", () => {
    const kiro = getStaticModels("kiro").map((m) => m.id);
    const openai = getStaticModels("openai").map((m) => m.id);

    // Kiro mirrors the real Kiro IDE list: claude families + auto + a few
    // non-Claude families (deepseek/minimax/glm/qwen). It must NOT contain
    // OpenAI or Ollama-only ids.
    expect(kiro).toContain("auto");
    expect(kiro.some((id) => id.includes("claude"))).toBe(true);
    expect(kiro.some((id) => id.startsWith("gpt") || id.startsWith("o1") || id.startsWith("o3"))).toBe(false);
    // OpenAI lists only GPT/o-series models, never Claude or Ollama
    expect(openai.some((id) => id.startsWith("gpt") || id.startsWith("o"))).toBe(true);
    expect(openai.some((id) => id.includes("claude"))).toBe(false);
    expect(openai.some((id) => id.includes("llama"))).toBe(false);
  });

  it("falls back to anthropic catalog for unknown providers", () => {
    expect(getStaticModels("does-not-exist")).toEqual(AVAILABLE_MODELS.anthropic);
  });

  it("exposes a default model per provider", () => {
    expect(getDefaultModel("kiro")).toBe("auto");
    expect(getDefaultModel("openai")).toBe("gpt-4o");
    expect(getDefaultModel("ollama")).toBe("llama3.1");
  });
});

describe("fetchGatewayModels (BUG 2)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns null when no base URL is provided", async () => {
    expect(await fetchGatewayModels("")).toBeNull();
  });

  it("parses the Anthropic /v1/models envelope from the gateway", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [
              { type: "model", id: "claude-sonnet-4-5", display_name: "Claude Sonnet 4.5" },
              { type: "model", id: "claude-opus-4-6", display_name: "Claude Opus 4.6" },
            ],
          }),
      })
    );

    const models = await fetchGatewayModels("http://127.0.0.1:8990/anthropic");
    expect(models).toEqual([
      { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" },
      { id: "claude-opus-4-6", name: "Claude Opus 4.6" },
    ]);
  });

  it("parses description and rate_multiplier from the gateway (KSA-237)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [
              {
                type: "model",
                id: "claude-opus-4.8",
                display_name: "Claude Opus 4.8",
                description: "Experimental preview of Claude Opus 4.8 model",
                rate_multiplier: 1.9,
              },
              {
                type: "model",
                id: "claude-sonnet-4.6",
                display_name: "Claude Sonnet 4.6",
                description: "General purpose model",
                rate_multiplier: 1,
              },
            ],
          }),
      })
    );

    const models = await fetchGatewayModels("http://127.0.0.1:8990/anthropic");
    expect(models).toEqual([
      {
        id: "claude-opus-4.8",
        name: "Claude Opus 4.8",
        description: "Experimental preview of Claude Opus 4.8 model",
        rateMultiplier: 1.9,
      },
      {
        id: "claude-sonnet-4.6",
        name: "Claude Sonnet 4.6",
        description: "General purpose model",
        rateMultiplier: 1,
      },
    ]);
  });

  it("returns null when the gateway responds non-OK", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({}) }));
    expect(await fetchGatewayModels("http://127.0.0.1:8990/anthropic")).toBeNull();
  });

  it("returns null when fetch throws (gateway unreachable)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    expect(await fetchGatewayModels("http://127.0.0.1:8990/anthropic")).toBeNull();
  });

  it("returns null when the envelope has an empty data array", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ data: [] }) }));
    expect(await fetchGatewayModels("http://127.0.0.1:8990/anthropic")).toBeNull();
  });
});
