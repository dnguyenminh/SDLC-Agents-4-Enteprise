/**
 * SA4E-85 — ToolApprovalGate unit tests (split from ToolApprovalGate.test.ts).
 * Covers: retry mechanism.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ToolApprovalGate } from '../ToolApprovalGate';

describe('ToolApprovalGate — Retry Mechanism', () => {
  let gate: ToolApprovalGate;

  beforeEach(() => {
    vi.useFakeTimers();
    gate = new ToolApprovalGate({ timeoutMs: 5_000 });
  });

  afterEach(() => {
    gate.dispose();
    vi.useRealTimers();
  });

  it('should allow retry after timeout rejection', async () => {
    const p1 = gate.requestApproval('tc-retry1');
    vi.advanceTimersByTime(5_001);
    await p1; // consumed — rejected

    const p2 = gate.retryApproval('tc-retry1');
    expect(p2).not.toBeNull();
    expect(gate.hasPending('tc-retry1')).toBe(true);

    gate.resolveApproval('tc-retry1', 'approve');
    const result = await p2!;
    expect(result.decision).toBe('approve');
  });

  it('should return null after max retries (3)', async () => {
    // Attempt 1 (initial request)
    const p1 = gate.requestApproval('tc-maxretry');
    vi.advanceTimersByTime(5_001);
    await p1;

    // Attempt 2 (retry 1)
    const p2 = gate.retryApproval('tc-maxretry');
    expect(p2).not.toBeNull();
    vi.advanceTimersByTime(5_001);
    await p2!;

    // Attempt 3 (retry 2)
    const p3 = gate.retryApproval('tc-maxretry');
    expect(p3).not.toBeNull();
    vi.advanceTimersByTime(5_001);
    await p3!;

    // Attempt 4 — should be blocked
    const p4 = gate.retryApproval('tc-maxretry');
    expect(p4).toBeNull();
  });

  it('should reset timers on retry', async () => {
    const p1 = gate.requestApproval('tc-timer-reset');
    vi.advanceTimersByTime(5_001);
    await p1;

    const p2 = gate.retryApproval('tc-timer-reset');
    expect(p2).not.toBeNull();

    // Should not auto-reject at 4000ms into retry
    vi.advanceTimersByTime(4_000);
    expect(gate.hasPending('tc-timer-reset')).toBe(true);

    // Should auto-reject at full timeout from retry start
    vi.advanceTimersByTime(1_001);
    const result = await p2!;
    expect(result.decision).toBe('reject');
    expect((result as { reason: string }).reason).toBe('timeout');
  });

  it('should return null for unknown toolCallId retry', () => {
    // Never requested — attemptHistory has 0
    const result = gate.retryApproval('tc-unknown');
    expect(result).toBeNull();
  });
});
