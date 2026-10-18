/**
 * SA4E-370 — context-window probe state machine tests.
 * T1 pre-probe fallback must not poison state; T2 success caches & locks;
 * T3 failed probes retry (max 3 attempts); T4 sync-only providers lock once.
 */
import { describe, it, expect, vi } from "vitest";
import {
  detectContextWindowEarlyHelper,
  getDetectedContextWindowHelper,
  type ContextProbeState,
} from "../pi-adapter-context-probe";
import type { LlmProvider } from "../../mcp/llm-provider";

/** Build a minimal faux provider; models the post-fix local shape (0 = unknown). */
function fauxProvider(overrides: Partial<LlmProvider> & { contextWindowTokens?: number } = {}): LlmProvider {
  const tokens = overrides.contextWindowTokens;
  const base: Record<string, unknown> = {
    getContextWindow: () => tokens ?? 0,
    ...overrides,
  };
  return base as unknown as LlmProvider;
}

describe("pi-adapter-context-probe (SA4E-370)", () => {
  // T1 — pre-probe: getContextWindow fallback is NOT read or cached yet
  it("T1: returns undefined pre-probe and does not cache the placeholder window", () => {
    const provider = fauxProvider({ getContextWindow: () => 8192 });
    const state: ContextProbeState = { probeDone: false };

    expect(getDetectedContextWindowHelper(provider, state)).toBeUndefined();
    expect(state.detectedWindow).toBeUndefined();
  });

  // T2 — probe success: detected value cached, locked, no re-probe
  it("T2: caches the detected window and never re-probes after success", async () => {
    let windowTokens = 0; // Post-fix local shape: 0 = not-yet-detected.
    const detect = vi.fn(async () => {
      // Async probe (fetch /v1/models) resolving the real window.
      await Promise.resolve();
      windowTokens = 131072;
    });
    const provider = fauxProvider({
      getContextWindow: () => windowTokens,
      detectContextWindow: detect as unknown as LlmProvider["detectContextWindow"],
    });
    const state: ContextProbeState = { probeDone: false };

    await detectContextWindowEarlyHelper(provider, state);

    expect(getDetectedContextWindowHelper(provider, state)).toBe(131072);
    expect(state.detectedWindow).toBe(131072);
    expect(state.probeDone).toBe(true);

    // Second call: probeDone stays true, detect fn is not invoked again.
    await detectContextWindowEarlyHelper(provider, state);
    expect(state.probeDone).toBe(true);
    expect(state.detectedWindow).toBe(131072);
    expect(detect).toHaveBeenCalledTimes(1);
  });

  // T3 — probe fail: retries up to 3 attempts, then locks permanently
  it("T3: failed probe stays open for retries and locks after 3 attempts", async () => {
    const provider = fauxProvider({
      // Post-fix local provider: 0 = not-yet-detected, sets nothing on failure.
      contextWindowTokens: 0,
      detectContextWindow: vi.fn(async () => undefined),
    });
    const state: ContextProbeState = { probeDone: false };

    await detectContextWindowEarlyHelper(provider, state);
    expect(state.probeDone).toBe(false);
    expect(state.attempts).toBe(1);

    await detectContextWindowEarlyHelper(provider, state);
    expect(state.probeDone).toBe(false);
    expect(state.attempts).toBe(2);

    await detectContextWindowEarlyHelper(provider, state);
    expect(state.probeDone).toBe(true);
    expect(state.attempts).toBe(3);

    // Locked: further calls do nothing.
    await detectContextWindowEarlyHelper(provider, state);
    expect(state.attempts).toBe(3);
    expect(state.detectedWindow).toBeUndefined();
  });

  // T4 — provider without detectContextWindow: one-shot lock + fallback allowed
  it("T4: sync-only provider locks once and the getContextWindow fallback applies", async () => {
    const provider = fauxProvider({ getContextWindow: () => 16384 });
    const state: ContextProbeState = { probeDone: false };

    await detectContextWindowEarlyHelper(provider, state);

    expect(state.probeDone).toBe(true);
    expect(getDetectedContextWindowHelper(provider, state)).toBe(16384);
    expect(state.detectedWindow).toBe(16384);
  });

  it("locks immediately when no provider is available", async () => {
    const state: ContextProbeState = { probeDone: false };
    await detectContextWindowEarlyHelper(undefined, state);
    expect(state.probeDone).toBe(true);
    expect(state.detectedWindow).toBeUndefined();
  });
});
