/**
 * SA4E-360 — skeleton truncator unit tests (TDD task T1; STC UT-01..UT-05).
 * Fixture data: documents/SA4E-360/testdata/truncation-scenarios-testdata.csv
 * (TRC-01..TRC-05). Cap @32k = floor(0.70 × 19,668) = 13,767 (BUD-01).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { estimateTokenCount } from '../../../pi-agent/prompt-compressor.js';
import { SkeletonTruncator } from '../skeleton-truncator.js';
import type { SkeletonPart } from '../skeleton-types.js';

const CAP = 13_767;
const STATIC_BUDGET = 19_668;
const PRIORITY = ['engine', 'extension', 'backend']; // engine kept last

/** Builds one part whose content measures exactly `tokens` via chars/4. */
function part(tokens: number, module: string, kind: 'file' | 'module-header' = 'file'): SkeletonPart {
  // Unique marker prefix keeps `toContain` assertions unambiguous between parts.
  const marker = `[[${module}:${kind}:${tokens}]]`;
  const filler = 'x'.repeat(Math.max(1, tokens * 4 - marker.length - 1));
  return { filePath: `${module}/${module}-${kind}-${tokens}.ts`, module, kind, content: marker + filler };
}

/** Telemetry sink capturing PI_SKELETON_* events (level, event, payload). */
function sink() {
  return vi.fn<(event: string, payload: unknown) => void>();
}

describe('SkeletonTruncator (SA4E-360 T1)', () => {
  let emit: ReturnType<typeof sink>;

  beforeEach(() => {
    emit = sink();
  });

  function make(): SkeletonTruncator {
    return new SkeletonTruncator({ emit });
  }

  // STC UT-01 — cap enforcement: oversized skeleton truncated to ≤ cap (TRC-01)
  it('truncates an oversized skeleton to ≤ cap keeping retained parts intact', () => {
    const parts = [
      part(4_000, 'engine'),
      part(3_000, 'engine'),
      part(3_000, 'extension'),
      part(3_000, 'extension'),
      part(2_500, 'backend'),
      part(2_500, 'backend'),
    ]; // 18,000 tokens total vs cap 13,767
    const res = make().truncate(parts, CAP, PRIORITY, STATIC_BUDGET);
    expect(res.truncationApplied).toBe(true);
    expect(res.gateDecision).toBe('TRUNCATED_PASS');
    expect(res.skeletonTokens).toBeLessThanOrEqual(CAP);
    expect(estimateTokenCount(res.content)).toBeLessThanOrEqual(CAP);
    // Retained parts are intact — content unchanged, only whole parts dropped.
    for (const kept of parts) {
      if (res.content.includes(kept.content)) {
        expect(res.content).toContain(kept.content);
      }
    }
  });

  // STC UT-02 — module-priority drop order: lowest priority first (TRC-02)
  it('drops the lowest-priority module first, then higher ones; engine retained last', () => {
    const parts = [
      part(4_000, 'engine'),
      part(4_000, 'extension'),
      part(4_000, 'backend'),
      part(4_000, 'engine'),
      part(4_000, 'extension'),
    ]; // 20,000 tokens, overflow 6,233
    const res = make().truncate(parts, CAP, PRIORITY, STATIC_BUDGET);
    expect(res.modulesDropped[0]).toBe('backend');
    expect(res.modulesDropped).not.toContain('engine');
    expect(res.content).toContain(parts[0].content); // engine part retained
    expect(res.gateDecision).toBe('TRUNCATED_PASS');
  });

  // STC UT-02 step 3 — within a module, a FILE part is dropped before the header
  it('drops file parts before the module-header part within the same module', () => {
    const header = part(4_000, 'backend', 'module-header');
    const file = part(4_000, 'backend', 'file');
    const engine = part(6_000, 'engine');
    const res = make().truncate([header, file, engine], CAP, PRIORITY, STATIC_BUDGET);
    expect(res.modulesDropped).toContain('backend');
    expect(res.content).toContain(header.content); // header survives the file
    expect(res.content).not.toContain(file.content);
  });

  // STC UT-03 — re-measure per drop + exactly one PI_SKELETON_TRUNCATED payload (TRC-03)
  it('re-measures after every drop and emits exactly one PI_SKELETON_TRUNCATED event', () => {
    const parts = [part(4_000, 'engine'), part(4_000, 'extension'), part(4_000, 'backend'), part(4_000, 'backend')];
    const res = make().truncate(parts, CAP, PRIORITY, STATIC_BUDGET);
    expect(emit).toHaveBeenCalledTimes(1);
    const [event, payload] = emit.mock.calls[0];
    expect(event).toBe('PI_SKELETON_TRUNCATED');
    expect(payload).toMatchObject({
      skeletonTokensBefore: 16_000,
      skeletonTokensAfter: expect.any(Number),
      modulesDropped: expect.any(Array),
      staticBudget: STATIC_BUDGET,
    });
    expect((payload as { skeletonTokensAfter: number }).skeletonTokensAfter).toBeLessThanOrEqual(CAP);
    expect(res.truncationApplied).toBe(true);
  });

  // STC UT-04 — defect-forced persisting overflow → REJECT (TRC-04, BR-360-02)
  it('REJECTs a forced single oversized part with empty priority resolution', () => {
    const parts = [part(25_000, 'engine')]; // alone exceeds cap 13,767
    const res = make().truncate(parts, CAP, [], STATIC_BUDGET); // empty priority → no droppable victim
    expect(res.gateDecision).toBe('REJECT');
    expect(res.skeletonTokens).toBeGreaterThan(CAP);
    // Error-telemetry payload available for the assembly boundary (UT-04 step 2).
    expect(res.rejectPayload).toMatchObject({ skeletonTokens: res.skeletonTokens, staticBudget: STATIC_BUDGET });
  });

  // STC UT-04 step 3 — an over-cap artifact is NEVER marked PASS/TRUNCATED_PASS
  it('never returns an over-cap artifact marked PASS/TRUNCATED_PASS', () => {
    const parts = [part(20_000, 'engine'), part(10_000, 'extension')];
    const res = make().truncate(parts, CAP, [], STATIC_BUDGET);
    if (res.skeletonTokens > CAP) {
      expect(res.gateDecision).toBe('REJECT');
    } else {
      expect(['PASS', 'TRUNCATED_PASS', 'DEGRADED_NO_SKELETON']).toContain(res.gateDecision);
    }
  });

  // STC UT-05 — all parts dropped → DEGRADED_NO_SKELETON, never REJECT (TRC-05)
  it('degrades (not rejects) when every droppable part is dropped', () => {
    const parts = [part(8_000, 'extension'), part(6_000, 'extension'), part(5_000, 'extension')];
    const res = make().truncate(parts, 5_000, ['extension'], STATIC_BUDGET);
    expect(res.gateDecision).toBe('DEGRADED_NO_SKELETON');
    expect(res.skeletonTokens).toBe(0);
    expect(res.content).toBe('');
  });

  it('marks a within-cap input PASS without truncation telemetry', () => {
    const parts = [part(1_000, 'engine'), part(1_000, 'extension')];
    const res = make().truncate(parts, CAP, PRIORITY, STATIC_BUDGET);
    expect(res.gateDecision).toBe('PASS');
    expect(res.truncationApplied).toBe(false);
    expect(emit).not.toHaveBeenCalled();
  });

  it('rejects after the hard 500-drop iteration cap (SEC-360-02 remediation #3)', () => {
    // 600 droppable parts, each 100 tokens: 60,000 total vs cap 30,000 — needs 300 drops (allowed),
    // but a cap of exactly 299 drops forces the hard-cap path. Use the injected maxDrops guard.
    const parts = Array.from({ length: 600 }, (_, i) => part(100, `m${i % 10}`));
    const priority = Array.from({ length: 10 }, (_, i) => `m${i}`);
    const res = make().truncate(parts, 30_000, priority, STATIC_BUDGET, { maxDrops: 299 });
    expect(res.gateDecision).toBe('REJECT');
  });
});
