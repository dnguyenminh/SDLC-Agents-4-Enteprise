/**
 * SA4E-355 UAT fix #1 — governance wired into the LEGACY chat path.
 *
 * Root cause: `runTurnOnce` sent the full request (system + accumulated
 * history + prompt + tool schemas) straight to the provider — the 73k-token
 * 400 from llama-server (n_ctx 65536). These tests pin the adapter contract:
 * the legacy turn is governed BEFORE `engine.executeTurn` (history compacted
 * or the turn REJECTED with PI_CONTEXT_BUDGET_EXCEEDED — provider never sees
 * an oversized request).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createModels } from '@earendil-works/pi-ai';
import { fauxProvider } from '@earendil-works/pi-ai/providers/faux';
import { PiWorkflowAdapter } from '../pi-workflow-adapter.js';
import { PiProvider } from '../pi-provider.js';
import type { PipelineState } from '../types/pi-workflow-state.js';
import type { ChatExtToWebviewMessage } from '../../chat-panel/message-protocol';

const { mockConfigValues } = vi.hoisted(() => ({
  mockConfigValues: {} as Record<string, unknown>,
}));

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: (k: string, d: unknown) => (k in mockConfigValues ? mockConfigValues[k] : d),
    })),
  },
  window: { createOutputChannel: () => ({ appendLine: vi.fn(), dispose: vi.fn() }) },
}));

/** UAT-shaped accumulated history: 58 messages of 4000 chars each (≈77k tokens under the wire heuristic). */
const bigHistory = Array.from({ length: 58 }, () => ({
  role: 'user',
  content: 'x'.repeat(4000),
}));

function chatErrors(onEvent: ReturnType<typeof vi.fn>): ChatExtToWebviewMessage[] {
  return onEvent.mock.calls
    .map((c: unknown[]) => c[0] as ChatExtToWebviewMessage)
    .filter((m) => (m as { type?: string }).type === 'chat:error');
}

/** Fake LlmProvider exposing a fixed context window (meta.n_ctx detection). */
const llmProviderWithWindow = (nCtx: number) => ({ getContextWindow: () => nCtx });

describe('PiWorkflowAdapter — legacy path governance (SA4E-355 UAT)', () => {
  let models: ReturnType<typeof createModels>;
  let onEvent: ReturnType<typeof vi.fn>;
  let adapter: PiWorkflowAdapter | undefined;

  beforeEach(() => {
    for (const k of Object.keys(mockConfigValues)) delete mockConfigValues[k];
    // faux resolves through configurePiProvider; key-requiring + no secrets → LEGACY path.
    // SA4E-370: getSetting reads ONLY the new dotted keys post-migration.
    mockConfigValues['llm.provider'] = 'faux';
    mockConfigValues['llm.model'] = 'faux-1';
    models = createModels();
    models.setProvider(fauxProvider().provider);
    onEvent = vi.fn();
  });

  afterEach(() => {
    adapter?.dispose();
    adapter = undefined;
    models.deleteProvider('faux');
  });

  const makeAdapter = (nCtx: number): PiWorkflowAdapter =>
    new PiWorkflowAdapter({
      mcpManager: { status: 'running' } as never,
      workspaceRoot: 'C:/ws/gov',
      onEvent: onEvent as (msg: ChatExtToWebviewMessage) => void,
      models,
      llmProvider: llmProviderWithWindow(nCtx) as never,
    });

  const engineSpy = (a: PiWorkflowAdapter) => {
    const engine = (a as unknown as { engine: { executeTurn: (...args: unknown[]) => Promise<unknown> } }).engine;
    return vi.spyOn(engine, 'executeTurn').mockResolvedValue({
      result: { ticketKey: 'KEY-GOV', sessionId: '', agentId: 'sm-agent', messages: [], toolCalls: [], streamChunks: [] },
      nextState: { ticketKey: 'KEY-GOV', threadId: '', currentPhase: '', chatHistory: [] } as PipelineState,
    });
  };

  it('COMPACT: over-budget legacy history reaches executeTurn trimmed oldest-first, no chat:error', async () => {
    adapter = makeAdapter(65536); // qwen UAT window — detected via provider meta.n_ctx
    const spy = engineSpy(adapter);
    adapter.setChatHistory(bigHistory);

    await adapter.invoke('KEY-GOV', 'requirements', 'p'.repeat(4096));

    expect(spy).toHaveBeenCalledTimes(1);
    const sent = (spy.mock.calls[0][0] as PipelineState).chatHistory ?? [];
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.length).toBeLessThan(58); // compaction actually happened
    // Newest message survives byte-identical; the OLDEST were dropped first.
    expect(sent[sent.length - 1].content).toBe(bigHistory[57].content);
    expect(sent[0].content).toBe(bigHistory[58 - sent.length].content);
    expect(chatErrors(onEvent)).toEqual([]);
  });

  it('REJECT: fixed part alone over the window → PI_CONTEXT_BUDGET_EXCEEDED, provider NEVER invoked', async () => {
    adapter = makeAdapter(2048); // usable floors at 1 — the workspace prompt alone cannot fit
    const spy = engineSpy(adapter);
    adapter.setChatHistory(bigHistory);

    await adapter.invoke('KEY-GOV', 'requirements', 'p'.repeat(4096));

    const errors = chatErrors(onEvent);
    expect(errors).toHaveLength(1); // exactly one actionable error — no PI_TURN_FAILED after it
    expect(errors[0]).toMatchObject({ code: 'PI_CONTEXT_BUDGET_EXCEEDED', retryable: false });
    expect((errors[0] as { message?: string }).message).toContain('PI_CONTEXT_BUDGET_EXCEEDED');
    // BR-09: the provider (engine → executor) is never called with the oversized request.
    expect(spy).not.toHaveBeenCalled();
  });

  it('UNDER-BUDGET: small history passes through to executeTurn byte-identical', async () => {
    adapter = makeAdapter(65536);
    const spy = engineSpy(adapter);
    const small = bigHistory.slice(0, 3);
    adapter.setChatHistory(small);

    await adapter.invoke('KEY-GOV', 'requirements', 'short question');

    expect(spy).toHaveBeenCalledTimes(1);
    const sent = (spy.mock.calls[0][0] as PipelineState).chatHistory ?? [];
    expect(sent.map((m: { content: string }) => m.content)).toEqual(small.map((m) => m.content));
    expect(chatErrors(onEvent)).toEqual([]);
  });

  // SA4E-355 UAT fix #3: with NO probe source, the window comes from the
  // runtime (pi-ai) model registry — faux-1 resolves contextWindow 128000,
  // so the turn is governed against 128k, never the 8192 terminal default.
  it('nCtx chain: no probe → runtime pi-ai registry window keeps the turn under budget', async () => {
    adapter = new PiWorkflowAdapter({
      mcpManager: { status: 'running' } as never,
      workspaceRoot: 'C:/ws/gov',
      onEvent: onEvent as (msg: ChatExtToWebviewMessage) => void,
      models,
      // no llmProvider → no probe; registry chain must resolve faux-1 → 128000
    });
    const spy = engineSpy(adapter);
    adapter.setChatHistory(bigHistory.slice(0, 20));

    await adapter.invoke('KEY-GOV', 'requirements', 'p'.repeat(4096));

    expect(spy).toHaveBeenCalledTimes(1); // governed, not rejected
    expect(chatErrors(onEvent)).toEqual([]);
    adapter.dispose();
    adapter = undefined;
  });

  // SA4E-355 UAT bug 2: the probe window (BR-01 top link) is pushed into the
  // provider so the intra-turn streamFn gate measures EVERY request against
  // the SAME budget chain as the turn-start gate.
  it('wires the detected window into the provider for the intra-turn gate', async () => {
    adapter = makeAdapter(65536);
    engineSpy(adapter);
    const provider = (adapter as unknown as { engine: { getProvider: () => PiProvider } }).engine.getProvider();
    const windowSpy = vi.spyOn(provider, 'setDetectedContextWindow');

    await adapter.invoke('KEY-GOV', 'requirements', 'short question');

    expect(windowSpy).toHaveBeenCalledWith(65536);
  });
});
