/**
 * SA4E-355 UAT fix #1 + #3 — legacy turn governance unit tests.
 *
 * Root cause: the legacy chat path (PiWorkflowEngine.executeTurn) sent the
 * FULL request (system + accumulated history + prompt + tool schemas) to the
 * provider with NO budget gate — 73k tokens hit llama-server's 65536 n_ctx
 * as a raw 400. These tests pin the governance contract: measure → compact
 * history → REJECT with PI_CONTEXT_BUDGET_EXCEEDED before any provider call.
 */
import { describe, it, expect } from 'vitest';
import {
  measureLegacyTurnTokens,
  compactHistoryToFit,
  governLegacyTurn,
  type LegacyTurnGovernanceInput,
} from '../legacy-turn-governance.js';
import { PiContextBudgetExceededError, isBudgetExceededError } from '../../pi-agent/budget-gate.js';

const msg = (content: string, role = 'user') => ({ role, content });
/** A history message of exactly `tokens` tokens under the chars/4 heuristic. */
const msgOfTokens = (tokens: number, role = 'user') => msg('x'.repeat(tokens * 4), role);

/** Qwen UAT budget: detected nCtx 65536 → usable 58245 (reserve 2048, margin 5243). */
const QWEN_INPUT: Pick<LegacyTurnGovernanceInput, 'modelId' | 'nCtxDetected'> = {
  modelId: 'qwen',
  nCtxDetected: 65536,
};

const baseInput = (over: Partial<LegacyTurnGovernanceInput>): LegacyTurnGovernanceInput => ({
  systemPrompt: '',
  history: [],
  chatInput: '',
  tools: [],
  modelId: 'qwen',
  nCtxDetected: undefined,
  ...over,
});

describe('measureLegacyTurnTokens — full request accounting (system+history+prompt+tools)', () => {
  it('counts every request component with the chars/4 heuristic', () => {
    const m = measureLegacyTurnTokens(
      baseInput({
        systemPrompt: 's'.repeat(400), // 100 workspace + 1875 SDK base parity = 1975
        history: [msgOfTokens(1000), msgOfTokens(500, 'assistant')], // 1500
        chatInput: 'p'.repeat(4096), // 1024
        tools: [{ name: 't', inputSchema: { a: 'y'.repeat(400) } }], // ~100
      })
    );
    // Workspace prompt + the SDK base prompt (parity with the session gate's
    // DEFAULT_SYSTEM_PROMPT_CHARS accounting = ceil(7500/4) = 1875).
    expect(m.systemTokens).toBe(1975);
    expect(m.historyTokens).toBe(1500);
    expect(m.promptTokens).toBe(1024);
    expect(m.toolSchemaTokens).toBeGreaterThan(0);
    expect(m.totalTokens).toBe(
      m.systemTokens + m.historyTokens + m.promptTokens + m.toolSchemaTokens
    );
  });

  it('never counts role names — content only (deterministic accounting)', () => {
    const m = measureLegacyTurnTokens(baseInput({ history: [msgOfTokens(1000, 'assistant')] }));
    expect(m.historyTokens).toBe(1000);
  });
});

describe('compactHistoryToFit — newest-first trim + compression fallback', () => {
  it('keeps the newest messages that fit the budget (trim-oldest)', () => {
    const history = Array.from({ length: 10 }, (_, i) => msgOfTokens(100));
    const kept = compactHistoryToFit(history, 450);
    // 100k ≤ 450 → the 4 newest survive; the 6 oldest are dropped.
    expect(kept.map((m) => m.content)).toEqual(history.slice(6).map((m) => m.content));
  });

  it('compresses a newest message that does not fit raw but fits compressed', () => {
    // Heading terminates stripExampleSections so 'keep me' survives compression.
    const compressible = msg(`Example:\n${'e'.repeat(3800)}\n\n# Restored\n\nkeep me`);
    const plain = msgOfTokens(1000);
    // Budget fits only the compressed newest; the older plain message cannot fit.
    const kept = compactHistoryToFit([plain, compressible], 500);
    expect(kept).toHaveLength(1);
    expect(kept[0].content.length).toBeLessThan(compressible.content.length);
    expect(kept[0].content).toContain('keep me');
  });

  it('returns an empty array when nothing fits (caller re-measures and rejects)', () => {
    const kept = compactHistoryToFit([msgOfTokens(1000), msgOfTokens(1000)], 10);
    expect(kept).toEqual([]);
  });

  it('negative budget yields an empty history (static alone already overflows)', () => {
    expect(compactHistoryToFit([msgOfTokens(100)], -5)).toEqual([]);
  });

  it('never mutates the input history', () => {
    const history = [msgOfTokens(1000), msgOfTokens(1000)];
    const snapshot = history.map((m) => m.content);
    compactHistoryToFit(history, 500);
    expect(history.map((m) => m.content)).toEqual(snapshot);
  });
});

describe('governLegacyTurn — budget gate + compaction + reject (BR-09)', () => {
  it('PASS-THROUGH: under-budget turn returns the history untouched', () => {
    const history = Array.from({ length: 10 }, () => msgOfTokens(1000)); // 10k
    const res = governLegacyTurn(
      baseInput({ ...QWEN_INPUT, history, chatInput: 'p'.repeat(4096) }) // +1024
    );
    // total = 1875 (SDK base prompt parity) + 10000 + 1024 = 12899 ≤ 58245
    expect(res.compacted).toBe(false);
    expect(res.history).toHaveLength(10);
    expect(res.history.map((m) => m.content)).toEqual(history.map((m) => m.content));
    expect(res.totalTokens).toBe(12899);
  });

  it('COMPACT: over-budget history is trimmed oldest-first, newest preserved', () => {
    // UAT scenario: ~58k tokens of accumulated history + 1024-token prompt.
    const history = Array.from({ length: 58 }, () => msgOfTokens(1000)); // 58000
    const res = governLegacyTurn(
      baseInput({ ...QWEN_INPUT, history, chatInput: 'p'.repeat(4096) })
    );
    // usable 58245; fixed part = 1875 + 1024 = 2899 → historyBudget = 55346 → 55 newest kept.
    expect(res.compacted).toBe(true);
    expect(res.history).toHaveLength(55);
    // The 3 OLDEST messages were dropped; the newest survive byte-identical.
    expect(res.history[0].content).toBe(history[3].content);
    expect(res.history[54].content).toBe(history[57].content);
    expect(res.totalTokens).toBe(1875 + 55000 + 1024);
    expect(res.totalTokens).toBeLessThanOrEqual(58245);
  });

  it('nCtx chain (fix #3): detected 65536 WINS over the qwen registry entry (32768)', () => {
    // With 65536 the budget keeps 55 messages; with the registry's 32768 it would keep fewer.
    const history = Array.from({ length: 58 }, () => msgOfTokens(1000));
    const detected = governLegacyTurn(
      baseInput({ modelId: 'qwen', nCtxDetected: 65536, history, chatInput: 'p'.repeat(4096) })
    );
    const registryOnly = governLegacyTurn(
      baseInput({ modelId: 'qwen', nCtxDetected: undefined, history, chatInput: 'p'.repeat(4096) })
    );
    expect(detected.history.length).toBe(55); // usable 58245 (BR-01 provider-first)
    expect(registryOnly.history.length).toBeLessThan(detected.history.length);
  });

  it('registry fallback resolves a window when no detection exists', () => {
    // qwen registry entry → nCtx 32768; usable = 32768 − 2048 − 2622 = 28098.
    const history = Array.from({ length: 40 }, () => msgOfTokens(1000)); // 40000
    const res = governLegacyTurn(
      baseInput({ modelId: 'qwen', nCtxDetected: undefined, history, chatInput: 'p'.repeat(4096) })
    );
    expect(res.compacted).toBe(true);
    // historyBudget = 28098 − 2899 = 25199 → 25 newest kept.
    expect(res.history).toHaveLength(25);
  });

  it('tool schemas consume budget headroom (fixed part of the request)', () => {
    const history = Array.from({ length: 58 }, () => msgOfTokens(1000));
    const withTools = governLegacyTurn(
      baseInput({
        ...QWEN_INPUT,
        history,
        chatInput: 'p'.repeat(4096),
        tools: [{ name: 'read', inputSchema: { blob: 'z'.repeat(4000) } }],
      })
    );
    expect(withTools.compacted).toBe(true);
    expect(withTools.history.length).toBeLessThan(55); // tools shrank the history budget
  });

  it('REJECT: static + prompt alone over the window → PI_CONTEXT_BUDGET_EXCEEDED, provider never called', () => {
    // phi-3-mini registry: nCtx 2048, maxOutput 512 → reserve 2000, margin 164 → usable 1.
    const attempt = () =>
      governLegacyTurn(
        baseInput({
          modelId: 'phi-3-mini',
          history: [msgOfTokens(1000)],
          chatInput: 'p'.repeat(4096),
        })
      );
    expect(attempt).toThrow(PiContextBudgetExceededError);
    try {
      attempt();
    } catch (err) {
      expect(isBudgetExceededError(err)).toBe(true);
      expect((err as PiContextBudgetExceededError).nCtx).toBe(2048);
      expect((err as PiContextBudgetExceededError).message).toContain('PI_CONTEXT_BUDGET_EXCEEDED');
    }
  });

  it('REJECT: even with EMPTY history the turn refuses when the fixed part cannot fit', () => {
    const attempt = () =>
      governLegacyTurn(baseInput({ modelId: 'phi-3-mini', chatInput: 'p'.repeat(4096) }));
    expect(attempt).toThrow(PiContextBudgetExceededError);
  });

  it('REJECT: error carries the post-compaction total and the usable budget', () => {
    try {
      governLegacyTurn(
        baseInput({ modelId: 'phi-3-mini', history: [msgOfTokens(500)], chatInput: 'p'.repeat(8192) })
      );
      expect.fail('expected PiContextBudgetExceededError');
    } catch (err) {
      const e = err as PiContextBudgetExceededError;
      expect(e.staticBudget).toBe(1); // usable floor (BR-01: never 0/unbounded)
      expect(e.staticTokens).toBeGreaterThan(e.staticBudget);
    }
  });
});
