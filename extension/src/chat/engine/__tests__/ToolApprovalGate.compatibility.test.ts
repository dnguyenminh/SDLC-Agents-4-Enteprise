/**
 * SA4E-85 — ToolApprovalGate unit tests (split from ToolApprovalGate.test.ts).
 * Covers: backward compatibility and 2-phase escalation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ToolApprovalGate } from '../ToolApprovalGate';

describe('ToolApprovalGate — Backward Compatibility', () => {
  it('should accept number as constructor arg', () => {
    const gate = new ToolApprovalGate(5000);
    expect(gate.pendingCount).toBe(0);
    gate.dispose();
  });

  it('should accept options object as constructor arg', () => {
    const gate = new ToolApprovalGate({ timeoutMs: 5000 });
    expect(gate.pendingCount).toBe(0);
    gate.dispose();
  });

  it('should default to 120s timeout with no args', () => {
    vi.useFakeTimers();
    const gate = new ToolApprovalGate();
    const p = gate.requestApproval('tc-def');
    vi.advanceTimersByTime(120_001);
    // Should have auto-rejected
    expect(gate.hasPending('tc-def')).toBe(false);
    gate.dispose();
    vi.useRealTimers();
  });
});

describe('ToolApprovalGate — 2-Phase Escalation', () => {
  let gate: ToolApprovalGate;
  let escalations: { toolCallId: string; remainingMs: number }[];

  beforeEach(() => {
    vi.useFakeTimers();
    escalations = [];
    gate = new ToolApprovalGate({
      timeoutMs: 10_000,
      warningMs: 7_000,
      onEscalation: (toolCallId, remainingMs) => {
        escalations.push({ toolCallId, remainingMs });
      },
    });
  });

  afterEach(() => {
    gate.dispose();
    vi.useRealTimers();
  });

  it('should fire onEscalation at warningMs', () => {
    gate.requestApproval('tc-esc1');
    vi.advanceTimersByTime(7_001);

    expect(escalations).toHaveLength(1);
    expect(escalations[0].toolCallId).toBe('tc-esc1');
    // remainingMs = timeoutMs - warningMs = 3000
    expect(escalations[0].remainingMs).toBe(3_000);
  });

  it('should not fire onEscalation if resolved before warning', () => {
    gate.requestApproval('tc-esc2');
    vi.advanceTimersByTime(3_000);
    gate.resolveApproval('tc-esc2', 'approve');
    vi.advanceTimersByTime(10_000);

    expect(escalations).toHaveLength(0);
  });

  it('should still hard-reject at timeoutMs after escalation', async () => {
    const promise = gate.requestApproval('tc-esc3');
    vi.advanceTimersByTime(10_001);

    const result = await promise;
    expect(result.decision).toBe('reject');
    expect((result as { reason: string }).reason).toBe('timeout');
    expect(escalations).toHaveLength(1);
  });

  it('should default warningMs to 70% of timeoutMs', () => {
    const customGate = new ToolApprovalGate({
      timeoutMs: 20_000,
      onEscalation: (id, ms) => escalations.push({ toolCallId: id, remainingMs: ms }),
    });
    customGate.requestApproval('tc-def-warn');
    // 70% of 20000 = 14000
    vi.advanceTimersByTime(14_001);
    expect(escalations).toHaveLength(1);
    // remainingMs = 20000 - 14000 = 6000
    expect(escalations[0].remainingMs).toBe(6_000);
    customGate.dispose();
  });
});
