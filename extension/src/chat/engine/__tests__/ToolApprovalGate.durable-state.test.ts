/**
 * SA4E-85 — ToolApprovalGate unit tests (split from ToolApprovalGate.test.ts).
 * Covers: durable state callback and metrics.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ToolApprovalGate } from '../ToolApprovalGate';
import type { PendingSnapshot } from '../ToolApprovalGate';

describe('ToolApprovalGate — Durable State Callback', () => {
  let gate: ToolApprovalGate;
  let stateChanges: PendingSnapshot[][];

  beforeEach(() => {
    vi.useFakeTimers();
    stateChanges = [];
    gate = new ToolApprovalGate({
      timeoutMs: 5_000,
      onStateChange: (pending) => stateChanges.push([...pending]),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should fire onStateChange on requestApproval', () => {
    gate.requestApproval('tc-s1');
    expect(stateChanges).toHaveLength(1);
    expect(stateChanges[0]).toHaveLength(1);
    expect(stateChanges[0][0].toolCallId).toBe('tc-s1');
  });

  it('should fire onStateChange on resolveApproval', () => {
    gate.requestApproval('tc-s2');
    gate.resolveApproval('tc-s2', 'approve');

    // 2 calls: one for request, one for resolve
    expect(stateChanges).toHaveLength(2);
    expect(stateChanges[1]).toHaveLength(0);
  });

  it('should fire onStateChange on timeout', () => {
    gate.requestApproval('tc-s3');
    vi.advanceTimersByTime(5_001);

    expect(stateChanges).toHaveLength(2);
    expect(stateChanges[1]).toHaveLength(0);
  });

  it('should fire onStateChange on dispose', () => {
    gate.requestApproval('tc-s4');
    gate.dispose();

    expect(stateChanges).toHaveLength(2);
    expect(stateChanges[1]).toHaveLength(0);
  });
});

describe('ToolApprovalGate — Metrics', () => {
  let gate: ToolApprovalGate;

  beforeEach(() => {
    vi.useFakeTimers();
    gate = new ToolApprovalGate(30_000);
  });

  afterEach(() => {
    gate.dispose();
    vi.useRealTimers();
  });

  it('should return zero metrics initially', () => {
    const m = gate.getMetrics();
    expect(m).toEqual({
      totalRequested: 0,
      totalApproved: 0,
      totalRejected: 0,
      avgResponseMs: 0,
    });
  });

  it('should track approved count and timing', async () => {
    gate.requestApproval('tc-m1');
    vi.advanceTimersByTime(500);
    gate.resolveApproval('tc-m1', 'approve');

    const m = gate.getMetrics();
    expect(m.totalRequested).toBe(1);
    expect(m.totalApproved).toBe(1);
    expect(m.avgResponseMs).toBe(500);
  });

  it('should track rejected count from timeout', async () => {
    gate.requestApproval('tc-m2');
    vi.advanceTimersByTime(30_001);

    const m = gate.getMetrics();
    expect(m.totalRejected).toBe(1);
    expect(m.totalRequested).toBe(1);
  });

  it('should compute avgResponseMs correctly', async () => {
    gate.requestApproval('tc-fast');
    vi.advanceTimersByTime(100);
    gate.resolveApproval('tc-fast', 'approve');

    gate.requestApproval('tc-slow');
    vi.advanceTimersByTime(300);
    gate.resolveApproval('tc-slow', 'approve');

    const m = gate.getMetrics();
    // avg of 100 and 300 = 200
    expect(m.avgResponseMs).toBe(200);
    expect(m.totalApproved).toBe(2);
  });
});
