/**
 * SA4E-85 — ToolApprovalGate unit tests (split from ToolApprovalGate.test.ts).
 * Covers: approval/reject, timeout, dispose, idempotency guard.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ToolApprovalGate } from '../ToolApprovalGate';

describe('ToolApprovalGate', () => {
  let gate: ToolApprovalGate;

  beforeEach(() => {
    vi.useFakeTimers();
    gate = new ToolApprovalGate(30_000);
  });

  afterEach(() => {
    gate.dispose();
    vi.useRealTimers();
  });

  it('should block until user approves', async () => {
    const promise = gate.requestApproval('tc-1');
    expect(gate.hasPending('tc-1')).toBe(true);

    gate.resolveApproval('tc-1', 'approve');

    const result = await promise;
    expect(result.decision).toBe('approve');
    expect(gate.hasPending('tc-1')).toBe(false);
  });

  it('should block until user rejects with reason', async () => {
    const promise = gate.requestApproval('tc-2');
    gate.resolveApproval('tc-2', 'reject');

    const result = await promise;
    expect(result.decision).toBe('reject');
    expect((result as { reason: string }).reason).toBe('user_reject');
  });

  it('should auto-reject on timeout with reason', async () => {
    const promise = gate.requestApproval('tc-timeout');
    vi.advanceTimersByTime(30_001);

    const result = await promise;
    expect(result.decision).toBe('reject');
    expect((result as { reason: string }).reason).toBe('timeout');
    expect(gate.hasPending('tc-timeout')).toBe(false);
  });

  it('should be no-op if resolving unknown toolCallId', () => {
    gate.resolveApproval('nonexistent', 'approve');
    expect(gate.pendingCount).toBe(0);
  });

  it('should handle multiple concurrent approvals independently', async () => {
    const p1 = gate.requestApproval('tc-a');
    const p2 = gate.requestApproval('tc-b');
    expect(gate.pendingCount).toBe(2);

    gate.resolveApproval('tc-b', 'reject');
    gate.resolveApproval('tc-a', 'approve');

    const r1 = await p1;
    const r2 = await p2;
    expect(r1.decision).toBe('approve');
    expect(r2.decision).toBe('reject');
    expect(gate.pendingCount).toBe(0);
  });

  it('should reject all pending on dispose with reason', async () => {
    const p1 = gate.requestApproval('tc-x');
    const p2 = gate.requestApproval('tc-y');
    gate.dispose();

    const r1 = await p1;
    const r2 = await p2;
    expect(r1).toEqual({ decision: 'reject', reason: 'dispose' });
    expect(r2).toEqual({ decision: 'reject', reason: 'dispose' });
    expect(gate.pendingCount).toBe(0);
  });

  it('should use custom timeout value', async () => {
    const shortGate = new ToolApprovalGate(100);
    const promise = shortGate.requestApproval('tc-short');
    vi.advanceTimersByTime(101);

    const result = await promise;
    expect(result.decision).toBe('reject');
    expect((result as { reason: string }).reason).toBe('timeout');
    shortGate.dispose();
  });
});

describe('ToolApprovalGate — Idempotency Guard', () => {
  let gate: ToolApprovalGate;

  beforeEach(() => {
    vi.useFakeTimers();
    gate = new ToolApprovalGate(30_000);
  });

  afterEach(() => {
    gate.dispose();
    vi.useRealTimers();
  });

  it('should return same promise for duplicate requestApproval calls', async () => {
    const p1 = gate.requestApproval('tc-dup');
    const p2 = gate.requestApproval('tc-dup');

    // Same reference — no duplicate entry created
    expect(p1).toBe(p2);
    expect(gate.pendingCount).toBe(1);

    gate.resolveApproval('tc-dup', 'approve');
    const r1 = await p1;
    const r2 = await p2;
    expect(r1.decision).toBe('approve');
    expect(r2.decision).toBe('approve');
  });

  it('should not increment totalRequested on duplicate call', () => {
    gate.requestApproval('tc-idem');
    gate.requestApproval('tc-idem');
    gate.requestApproval('tc-idem');

    expect(gate.getMetrics().totalRequested).toBe(1);
  });
});
