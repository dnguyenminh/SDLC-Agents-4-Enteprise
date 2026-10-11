import { describe, it, expect, beforeEach, vi } from 'vitest';

const { estimatorState } = vi.hoisted(() => ({ estimatorState: { throwOnEstimate: false } }));

vi.mock('../../logger', () => ({
  logger: {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// STC-202: stub the token estimator so it throws on demand (fail-open proof).
vi.mock('../prompt-compressor', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../prompt-compressor')>();
  return {
    ...actual,
    estimateTokenCount: (text: string): number => {
      if (estimatorState.throwOnEstimate) throw new Error('estimator exploded (STC-202 stub)');
      return actual.estimateTokenCount(text);
    },
  };
});

import { logger } from '../../logger';
import { estimateTokenCount } from '../prompt-compressor';
import { scopedSteering } from '../scoped-steering';
import type { ContextBudget } from '../models/ContextBudget';

// STC: STC-007 — phase requirements loads only phase-1 + shared steering
// STC: STC-018 — steering over cap: lowest priority dropped first; security lines survive
// STC: STC-103 — phase missing/unmapped → shared-* steering only + info log
// STC: STC-104 — steering under cap: no drops, byte-identical pass-through
// STC: STC-202 — scopedSteering internal failure → fail-open to base content
// STC: STC-303 — all NON_STRIPPABLE_RE variants survive drops (BR-05)
// STC: STC-305 — unknown role → steering unchanged (BR-07 fail-open)
// STC: UC-03 step 6 / BR-04 — conditional compression of scoped steering entries

const budget32k: ContextBudget = {
  nCtx: 32768, reserveOutput: 2048, safetyMargin: 2622, staticBudget: 19668, historyBudget: 8430,
};
const budget8k: ContextBudget = {
  nCtx: 8192, reserveOutput: 2048, safetyMargin: 656, staticBudget: 3841, historyBudget: 1647,
};
const budgetCap3k: ContextBudget = { ...budget8k, staticBudget: 3000 };
const budgetCap500: ContextBudget = { ...budget8k, staticBudget: 500 };

const NINE_STEERING_FILES = [
  'phase-1-requirements.md',
  'phase-2-specification.md',
  'phase-3-design.md',
  'phase-4-test-planning.md',
  'phase-5-implementation.md',
  'phase-6-testing.md',
  'phase-7-deployment.md',
  'shared-jira.md',
  'shared-quality-gates.md',
];

const SECURITY_LINES = [
  'security: never commit secrets',
  'WARNING: gate required',
  'Never call provider oversized',
  'do not strip this line',
  'IMPORTANT: keep fail-safe',
  '- security: bullet variant',
  '* warning: bullet variant',
];

/** Builds a steering entry whose token estimate is exactly `targetTokens`. */
function sizedSteering(name: string, extraLines: string[], targetTokens: number): string {
  const head = [name, ...extraLines].join('\n');
  const filler = 'governance guidance for the pipeline';
  let content = head;
  while (content.length < targetTokens * 4 - 1) content += '\n' + filler;
  return content.slice(0, targetTokens * 4);
}

describe('scopedSteering (UC-02 + UC-03 step 6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    estimatorState.throwOnEstimate = false;
  });

  it('STC-007: phase=requirements loads only phase-1 + shared-* steering', () => {
    const out = scopedSteering(NINE_STEERING_FILES, 'BA', 'requirements', budget32k);
    expect(out).toEqual(['phase-1-requirements.md', 'shared-jira.md', 'shared-quality-gates.md']);
  });

  it('STC-103: phase missing/unmapped → shared-* only + info log', () => {
    for (const phase of [undefined, '']) {
      vi.clearAllMocks();
      const out = scopedSteering(NINE_STEERING_FILES, 'BA', phase, budget32k);
      expect(out).toEqual(['shared-jira.md', 'shared-quality-gates.md']);
      expect(logger.info).toHaveBeenCalledWith(
        'PI_STEERING_PHASE_UNMAPPED',
        expect.objectContaining({ phase: phase ?? '' })
      );
    }
  });

  it('STC-104: steering under cap — no drops, byte-identical pass-through', () => {
    const base = ['shared-jira.md', 'shared-quality-gates.md', 'shared-diagrams.md'].map((n) =>
      sizedSteering(n, [], 400)
    );
    const out = scopedSteering(base, 'QA', 'test-planning', budget8k);
    expect(out).toEqual(base);
    expect(out[0]).toBe(base[0]);
  });

  it('STC-018: over cap — lowest priority dropped first; security lines survive (BR-05)', () => {
    const gates = sizedSteering('shared-quality-gates.md', [], 2000);
    const phase4 = sizedSteering('phase-4-test-planning.md', ['security: never skip the quality gate'], 2500);
    const jira = sizedSteering('shared-jira.md', [], 1500);

    const out = scopedSteering([gates, phase4, jira], 'QA', 'test-planning', budgetCap3k);

    expect(out[0]).toBe(gates); // priority 1 (governance shared file) kept
    expect(out).toHaveLength(2); // gates + preserved security directives
    const joined = out.join('\n');
    expect(joined).toContain('security: never skip the quality gate'); // BR-05
    expect(joined).not.toContain('shared-jira.md'); // priority 3 dropped first
    expect(joined).not.toContain('phase-4-test-planning.md'); // priority 2 dropped next
    expect(out.reduce((sum, e) => sum + estimateTokenCount(e), 0)).toBeLessThanOrEqual(3000);
  });

  it('STC-303: all 7 NON_STRIPPABLE_RE variants survive scope drops AND cap drops', () => {
    const phase2 = sizedSteering('phase-2-specification.md', SECURITY_LINES.slice(0, 4), 1000);
    const jira = sizedSteering('shared-jira.md', SECURITY_LINES.slice(4), 1000);
    const gates = sizedSteering('shared-quality-gates.md', [], 300);

    const out = scopedSteering([phase2, jira, gates], 'QA', 'requirements', budgetCap500);
    const joined = out.join('\n');

    for (const line of SECURITY_LINES) expect(joined).toContain(line);
    expect(joined).not.toContain('phase-2-specification.md'); // dropped by phase scope
    expect(joined).not.toContain('shared-jira.md'); // dropped by cap
  });

  it('STC-202: internal failure → fail-open to base, error logged, no propagation', () => {
    estimatorState.throwOnEstimate = true;
    const out = scopedSteering(NINE_STEERING_FILES, 'BA', 'requirements', budget32k);
    expect(out).toBe(NINE_STEERING_FILES); // base returned unchanged
    expect(logger.error).toHaveBeenCalledWith(
      'PI_STEERING_SCOPE_FAILED',
      expect.objectContaining({ error: expect.any(String) })
    );
  });

  it('STC-305: unknown role → base unchanged even with a phase (BR-07 fail-open)', () => {
    expect(scopedSteering(NINE_STEERING_FILES, 'intern-x', 'requirements', budget32k)).toBe(NINE_STEERING_FILES);
  });

  it('keeps non-steering entries (e.g. workspace prompt) untouched by scoping', () => {
    const prompt = 'You are running inside the SDLC Agents VS Code extension chat.';
    const out = scopedSteering([prompt, ...NINE_STEERING_FILES], 'BA', 'requirements', budget32k);
    expect(out[0]).toBe(prompt);
  });

  it('never drops non-steering entries even when the cap cannot be met', () => {
    const prompt = 'Workspace prompt that must survive any cap pressure.';
    const out = scopedSteering([prompt, 'shared-jira.md'], 'QA', 'test-planning', {
      ...budget8k,
      staticBudget: 1,
    });
    expect(out[0]).toBe(prompt);
    expect(logger.warn).toHaveBeenCalledWith('PI_STEERING_OVER_CAP', expect.anything());
  });

  it('UC-03 step 6: compress=true strips boilerplate, keeps security lines (BR-04/BR-05)', () => {
    const entry = [
      'shared-quality-gates.md',
      '<!-- internal comment -->',
      'Tip: run the demo first',
      'security: never disable the budget gate',
      'Regular governance prose stays.',
    ].join('\n');
    const out = scopedSteering([entry], 'QA', 'test-planning', budget32k, { compress: true });
    const joined = out.join('\n');
    expect(joined).toContain('security: never disable the budget gate');
    expect(joined).not.toContain('<!-- internal comment -->');
    expect(joined).not.toContain('Tip: run the demo first');
  });

  it('BR-15: non-worsening — dense steering stays byte-identical under compression', () => {
    const dense = 'shared-quality-gates.md\nDeterministic governance prose with no strippable boilerplate.';
    const out = scopedSteering([dense], 'QA', 'test-planning', budget32k, { compress: true });
    expect(out[0]).toBe(dense);
  });

  it('BR-04: compress flag default false → entries pass through byte-identical', () => {
    const entry = 'shared-quality-gates.md\n<!-- comment -->\nsecurity: keep me';
    expect(scopedSteering([entry], 'QA', 'test-planning', budget32k)[0]).toBe(entry);
    expect(scopedSteering([entry], 'QA', 'test-planning', budget32k, { compress: false })[0]).toBe(entry);
  });
});
