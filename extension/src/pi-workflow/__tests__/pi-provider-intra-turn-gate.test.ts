/**
 * SA4E-355 UAT bug 2 — intra-turn gate wired into the REAL Agent streamFn.
 *
 * UAT timeline: turn starts at 4,245 tokens → the agent reads large files →
 * tool results accumulate in the transcript → an intra-turn request reaches
 * 76,349 tokens → the provider answers 400. These tests run the REAL
 * pi-agent-core Agent + REAL PiProvider (faux model, no mocks of the loop)
 * and pin: (a) every delegated request fits the usable budget, (b) the turn
 * completes across compacted iterations, (c) an uncompactable request is
 * REJECTED with PI_CONTEXT_BUDGET_EXCEEDED and never delegated, (d) the
 * agent's own transcript is never mutated by the gate.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createModels } from '@earendil-works/pi-ai';
import type { MutableModels } from '@earendil-works/pi-ai';
import { fauxProvider, fauxAssistantMessage, fauxToolCall } from '@earendil-works/pi-ai/providers/faux';
import { Type } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import { PiProvider } from '../pi-provider.js';
import { usableTokensOf } from '../../pi-agent/models/ContextBudget.js';
import { resolveContextBudget } from '../../pi-agent/context-budget-resolver.js';
import { measureIntraTurnRequest } from '../intra-turn-budget-gate.js';
import { logger } from '../../logger.js';

/** Tool result payload of ~`tokens` tokens (conservative wire heuristic — chars/3). */
const resultOfTokens = (tokens: number): string => 'x'.repeat(tokens * 3);

/** Qwen UAT chain: probe-detected 65536 → usable 58293. */
const QWEN_NCTX = 65536;
const usableFor = (nCtx?: number): number =>
  usableTokensOf(resolveContextBudget({ modelId: 'faux-1', nCtxDetected: nCtx }));

/** A tool that returns a huge text payload — the UAT "read a big file". */
const bigReadTool = (tokens: number): AgentTool =>
  ({
    name: 'read_big',
    label: 'Big read',
    description: 'Returns a large file body',
    parameters: Type.Object({ path: Type.String() }),
    execute: async () => ({ content: [{ type: 'text', text: resultOfTokens(tokens) }], details: {} }),
  }) as unknown as AgentTool;

describe('PiProvider intra-turn budget gate — real Agent loop, growing tool results', () => {
  let provider: PiProvider;
  let models: MutableModels;
  let faux: ReturnType<typeof fauxProvider>;
  let delegated: number[]; // measured total of EVERY context delegated to the registry
  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    process.env.NODE_ENV = 'test';
    infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => undefined);
    provider = new PiProvider();
    models = createModels();
    faux = fauxProvider();
    models.setProvider(faux.provider);
    delegated = [];
    // Observe exactly what reaches the provider boundary (the wire payload),
    // then delegate to the REAL registry stream (captured BEFORE the spy).
    const realStream = models.streamSimple.bind(models);
    vi.spyOn(models, 'streamSimple').mockImplementation((model, context, options) => {
      delegated.push(
        measureIntraTurnRequest({ messages: context.messages, modelId: 'faux-1', nCtxDetected: QWEN_NCTX })
          .totalTokens
      );
      return realStream(model, context, options);
    });
    await provider.initialize({ transportType: 'HTTP', models });
    await provider.setModel('faux', 'faux-1');
    provider.setDetectedContextWindow(QWEN_NCTX);
  });

  afterEach(() => {
    infoSpy.mockRestore();
    vi.restoreAllMocks();
    models.deleteProvider('faux');
    provider.dispose();
    delete process.env.NODE_ENV;
  });

  it('COMPACT across iterations: 4 big reads (60k+) still complete — every request fits usable', async () => {
    // Iterations 1..5 request a read (toolUse); the tool appends ~15k tokens each.
    // By the 5th request the transcript exceeds usable 58293 → the gate compacts.
    faux.setResponses([
      fauxAssistantMessage([fauxToolCall('read_big', { path: 'a' }, { id: 'tc-1' })], { stopReason: 'toolUse' }),
      fauxAssistantMessage([fauxToolCall('read_big', { path: 'b' }, { id: 'tc-2' })], { stopReason: 'toolUse' }),
      fauxAssistantMessage([fauxToolCall('read_big', { path: 'c' }, { id: 'tc-3' })], { stopReason: 'toolUse' }),
      fauxAssistantMessage([fauxToolCall('read_big', { path: 'd' }, { id: 'tc-4' })], { stopReason: 'toolUse' }),
      fauxAssistantMessage([fauxToolCall('read_big', { path: 'e' }, { id: 'tc-5' })], { stopReason: 'toolUse' }),
      fauxAssistantMessage('analysis finished'),
    ]);

    const result = await provider.run({
      prompt: 'read the big files',
      provider: 'faux',
      model: 'faux-1',
      tools: [bigReadTool(15000)],
    });

    // The turn COMPLETED — the 400 never happened.
    expect(result.errorMessage).toBeUndefined();
    expect(result.text).toContain('analysis finished');
    expect(result.toolCalls).toHaveLength(5);
    // (a) The provider NEVER saw an oversized request.
    expect(delegated.length).toBeGreaterThanOrEqual(6);
    const usable = usableFor(QWEN_NCTX);
    for (const total of delegated) expect(total).toBeLessThanOrEqual(usable);
    // (d) PI_LEGACY_HISTORY_COMPACTED proves the gate compacted intra-turn.
    expect(infoSpy.mock.calls.some((c) => c[0] === 'PI_LEGACY_HISTORY_COMPACTED')).toBe(true);
    // The agent transcript keeps EVERY tool result — the gate never mutated agent state.
    const toolResults = result.messages.filter((m) => (m as { role?: string }).role === 'toolResult');
    expect(toolResults).toHaveLength(5);
  });

  it('COMPACT (bug 3): one 70k-token tool result is dropped ATOMICALLY — the pinned user prompt keeps the turn alive', async () => {
    // UAT bug 3: an incompressible 70k tool unit cannot fit the budget even
    // compressed. With the newest user message pinned, the gate drops the
    // oversized unit whole and the request STAYS respondable — the turn
    // completes instead of the llama-server 500 ("No user query found") that
    // the old drop-the-user behavior produced.
    faux.setResponses([
      fauxAssistantMessage([fauxToolCall('read_big', { path: 'huge' }, { id: 'tc-1' })], { stopReason: 'toolUse' }),
      fauxAssistantMessage('continued without the huge result'),
    ]);

    const result = await provider.run({
      prompt: 'read the huge file',
      provider: 'faux',
      model: 'faux-1',
      tools: [bigReadTool(70000)],
    });

    // The turn COMPLETED — no PI_CONTEXT_BUDGET_EXCEEDED, no provider 500.
    expect(result.errorMessage).toBeUndefined();
    expect(result.text).toContain('continued without the huge result');
    // (a) The provider NEVER saw an oversized request.
    const usable = usableFor(QWEN_NCTX);
    for (const total of delegated) expect(total).toBeLessThanOrEqual(usable);
    // (d) PI_LEGACY_HISTORY_COMPACTED proves the gate compacted intra-turn.
    expect(infoSpy.mock.calls.some((c) => c[0] === 'PI_LEGACY_HISTORY_COMPACTED')).toBe(true);
    // The agent transcript keeps the 70k result — the gate never mutated agent state.
    const toolResults = result.messages.filter((m) => (m as { role?: string }).role === 'toolResult');
    expect(toolResults).toHaveLength(1);
  });

  it('BR-01 chain: without setDetectedContextWindow the runtime REGISTRY window governs (faux-1 → 128000)', async () => {
    provider.setDetectedContextWindow(undefined);
    // A 60k-token prompt overflows the detected 65536 window (usable 58293)
    // but fits the faux-1 REGISTRY window (128000 → usable 115760) — passing
    // proves the gate fell through detection to the registry link.
    faux.setResponses([fauxAssistantMessage('fits under the registry window')]);
    const result = await provider.run({ prompt: resultOfTokens(60000), provider: 'faux', model: 'faux-1' });

    expect(result.errorMessage).toBeUndefined();
    expect(delegated).toHaveLength(1);
    expect(delegated[0]).toBeLessThanOrEqual(usableOfWindow(128000));
  });

  it('BR-01 chain: setDetectedContextWindow(65536) WINS over the registry window', async () => {
    // Same 60k-token prompt — with detection present the smaller detected
    // window governs and the request is REJECTED (never delegated).
    faux.setResponses([fauxAssistantMessage('unreachable under the detected window')]);
    const result = await provider.run({ prompt: resultOfTokens(60000), provider: 'faux', model: 'faux-1' });

    expect(String(result.errorMessage)).toContain('PI_CONTEXT_BUDGET_EXCEEDED');
    expect(delegated).toHaveLength(0); // the oversized request never reached the provider
  });
});

/** Usable budget for a given nCtx (faux-1 → registry reserve floor 2000). */
function usableOfWindow(nCtx: number): number {
  return usableTokensOf(resolveContextBudget({ modelId: 'faux-1', nCtxDetected: nCtx }));
}

