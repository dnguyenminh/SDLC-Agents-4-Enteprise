/**
 * PegaWhenEvaluator.test.ts — Tests When-condition evaluation, including the Pega textual
 * logical operator normalization (.AND./.OR. -> &&/||).
 */
import { describe, it, expect } from 'vitest';
import { PegaWhenEvaluator } from '../../expression/PegaWhenEvaluator.js';
import { PegaClipboardContext } from '../../expression/PegaClipboardContext.js';

const ctx = new PegaClipboardContext(
  {
    pyWorkPage: {
      Amount: { type: 'Number', value: 150 },
      Status: { type: 'Text', value: 'Open' },
    },
  },
  'pyWorkPage',
);
const when = new PegaWhenEvaluator();

describe('PegaWhenEvaluator — grammar operators', () => {
  it('passes && condition', () => {
    expect(when.evaluateWhen('.Amount > 100 && .Status = "Open"', ctx).passed).toBe(true);
  });
  it('fails when one side is false', () => {
    expect(when.evaluateWhen('.Amount > 200 && .Status = "Open"', ctx).passed).toBe(false);
  });
});

describe('PegaWhenEvaluator — Pega textual operators normalized', () => {
  it('.AND. behaves like &&', () => {
    expect(when.evaluateWhen('.Amount > 100 .AND. .Status = "Open"', ctx).passed).toBe(true);
  });
  it('.OR. behaves like ||', () => {
    expect(when.evaluateWhen('.Amount > 200 .OR. .Status = "Open"', ctx).passed).toBe(true);
  });
  it('case-insensitive .and./.or.', () => {
    expect(when.evaluateWhen('.Amount > 100 .and. .Status = "Open"', ctx).passed).toBe(true);
  });
});

describe('PegaWhenEvaluator — failure handling', () => {
  it('returns passed=false with trace on evaluation error (missing prop)', () => {
    const r = when.evaluateWhen('.Missing = "x"', ctx);
    expect(r.passed).toBe(false);
    expect(r.trace.some((t) => t.includes('ERROR'))).toBe(true);
  });
});
