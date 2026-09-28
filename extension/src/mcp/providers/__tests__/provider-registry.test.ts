/**
 * Provider registry tests — lookups, uniqueness, metadata completeness, and category grouping.
 */
import { describe, it, expect } from "vitest";
import { PROVIDER_REGISTRY, getProviderDef, getProvidersByCategory } from "../provider-registry";

describe("PROVIDER_REGISTRY", () => {
  it("contains the core providers with expected metadata", () => {
    expect(getProviderDef("anthropic")).toMatchObject({
      id: "anthropic", category: "cloud", apiType: "anthropic", requiresApiKey: true,
    });
    expect(getProviderDef("openai")?.apiType).toBe("openai-compatible");
    expect(getProviderDef("ollama")).toMatchObject({
      id: "ollama", category: "local", apiType: "ollama", requiresApiKey: false,
    });
    expect(getProviderDef("onnx")).toMatchObject({ id: "onnx", apiType: "onnx", requiresApiKey: false });
  });

  it("returns undefined for unknown or empty provider ids", () => {
    expect(getProviderDef("does-not-exist")).toBeUndefined();
    expect(getProviderDef("")).toBeUndefined();
  });

  it("has unique ids across the registry", () => {
    const ids = PROVIDER_REGISTRY.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("defines complete metadata for every provider entry", () => {
    for (const p of PROVIDER_REGISTRY) {
      expect(p.id).toBeTruthy();
      expect(p.label).toBeTruthy();
      expect(["cloud", "gateway", "local", "enterprise"]).toContain(p.category);
      expect(["anthropic", "openai-compatible", "ollama", "onnx", "none"]).toContain(p.apiType);
      expect(typeof p.baseUrl).toBe("string");
      expect(typeof p.requiresApiKey).toBe("boolean");
    }
  });

  it("registers a broad list of ecosystem providers", () => {
    expect(PROVIDER_REGISTRY.length).toBeGreaterThan(100);
  });
});

describe("getProvidersByCategory", () => {
  it("groups every registered provider into one of the four categories", () => {
    const grouped = getProvidersByCategory();
    const total = Object.values(grouped).reduce((sum, list) => sum + list.length, 0);
    expect(total).toBe(PROVIDER_REGISTRY.length);
    expect(Object.keys(grouped)).toEqual(["cloud", "gateway", "local", "enterprise"]);
  });

  it("places known providers in the right buckets", () => {
    const grouped = getProvidersByCategory();
    expect(grouped.local.map(p => p.id)).toContain("ollama");
    expect(grouped.cloud.map(p => p.id)).toContain("openai");
    expect(grouped.gateway.map(p => p.id)).toContain("openrouter");
    expect(grouped.enterprise.map(p => p.id)).toContain("azure");
  });

  it("has at least one provider in every category", () => {
    for (const category of Object.values(getProvidersByCategory())) {
      expect(category.length).toBeGreaterThan(0);
    }
  });
});