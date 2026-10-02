/**
 * Tests for llm-secret-keys — new `sdlcAgents.*` API-key keys + migrate-on-read
 * from the legacy `kiroSdlc.*` namespace.
 */
import { describe, it, expect, beforeEach } from "vitest";
import type { SecretStorage } from "vscode";
import { llmSecretKey, legacyLlmSecretKey, readLlmApiKey } from "../llm-secret-keys";

/** Minimal in-memory SecretStorage stub. */
function makeSecrets(seed: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(seed));
  const secrets = {
    get: (k: string) => Promise.resolve(store.get(k)),
    store: (k: string, v: string) => { store.set(k, v); return Promise.resolve(); },
    delete: (k: string) => { store.delete(k); return Promise.resolve(); },
    onDidChange: () => ({ dispose() {} }),
  } as unknown as SecretStorage;
  return { store, secrets };
}

describe("llm-secret-keys key builders", () => {
  it("maps anthropic and kiro to the anthropic slot under sdlcAgents.*", () => {
    expect(llmSecretKey("anthropic")).toBe("sdlcAgents.anthropicApiKey");
    expect(llmSecretKey("kiro")).toBe("sdlcAgents.anthropicApiKey");
  });

  it("maps other providers to <id>ApiKey", () => {
    expect(llmSecretKey("openai")).toBe("sdlcAgents.openaiApiKey");
    expect(llmSecretKey("lmstudio")).toBe("sdlcAgents.lmstudioApiKey");
  });

  it("builds the legacy kiroSdlc.* fallback key", () => {
    expect(legacyLlmSecretKey("anthropic")).toBe("kiroSdlc.anthropicApiKey");
    expect(legacyLlmSecretKey("openai")).toBe("kiroSdlc.openaiApiKey");
  });
});

describe("readLlmApiKey migrate-on-read", () => {
  let store: Map<string, string>;
  let secrets: SecretStorage;

  beforeEach(() => { ({ store, secrets } = makeSecrets()); });

  it("returns the new-key value directly when present", async () => {
    store.set("sdlcAgents.anthropicApiKey", "new-key");
    store.set("kiroSdlc.anthropicApiKey", "old-key");
    expect(await readLlmApiKey(secrets, "anthropic")).toBe("new-key");
  });

  it("migrates the legacy value to the new key on read", async () => {
    store.set("kiroSdlc.openaiApiKey", "legacy-key");
    const value = await readLlmApiKey(secrets, "openai");
    expect(value).toBe("legacy-key");
    // migrated forward
    expect(store.get("sdlcAgents.openaiApiKey")).toBe("legacy-key");
  });

  it("returns undefined when neither key is set", async () => {
    expect(await readLlmApiKey(secrets, "anthropic")).toBeUndefined();
  });

  it("does not throw when SecretStorage.get fails (fail-open)", async () => {
    const failing = {
      get: () => Promise.reject(new Error("boom")),
      store: () => Promise.resolve(),
      delete: () => Promise.resolve(),
      onDidChange: () => ({ dispose() {} }),
    } as unknown as SecretStorage;
    await expect(readLlmApiKey(failing, "anthropic")).resolves.toBeUndefined();
  });
});
