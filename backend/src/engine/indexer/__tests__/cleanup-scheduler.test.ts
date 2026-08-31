/**
 * Unit tests for CleanupScheduler — periodic GC of terminal index-operation
 * records older than the retention window. Repo is injected/mocked; timer
 * behavior is validated with fake timers.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CleanupScheduler } from '../cleanup-scheduler.js';

function makeMockRepo(deleted = 3) {
  return { deleteTerminalOlderThan: vi.fn().mockResolvedValue(deleted) };
}

describe('CleanupScheduler', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('runOnce deletes terminal records older than 1h', async () => {
    const repo = makeMockRepo(4);
    const scheduler = new CleanupScheduler(repo as any);
    await scheduler.runOnce();
    expect(repo.deleteTerminalOlderThan).toHaveBeenCalledWith(1);
  });

  it('runOnce swallows repo errors (non-fatal)', async () => {
    const repo = makeMockRepo();
    repo.deleteTerminalOlderThan.mockRejectedValue(new Error('boom'));
    const scheduler = new CleanupScheduler(repo as any);
    await expect(scheduler.runOnce()).resolves.toBeUndefined();
  });

  it('start schedules recurring passes and an initial pass after 5s', async () => {
    const repo = makeMockRepo();
    const scheduler = new CleanupScheduler(repo as any);
    const runOnceSpy = vi.spyOn(scheduler, 'runOnce').mockResolvedValue();
    scheduler.start();
    // Initial pass scheduled at 5s.
    await vi.advanceTimersByTimeAsync(5000);
    expect(runOnceSpy).toHaveBeenCalledTimes(1);
    // Recurring interval at 10min.
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(runOnceSpy).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });

  it('stop clears the interval timer (no recurring passes after initial)', async () => {
    const repo = makeMockRepo();
    const scheduler = new CleanupScheduler(repo as any);
    const runOnceSpy = vi.spyOn(scheduler, 'runOnce').mockResolvedValue();
    scheduler.start();
    // Let the fire-and-forget initial pass (5s) run, then stop.
    await vi.advanceTimersByTimeAsync(5000);
    scheduler.stop();
    // Advance well past one interval — no further recurring passes should occur.
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000 + 10000);
    expect(runOnceSpy).toHaveBeenCalledTimes(1);
  });

  it('start is idempotent (no double timer)', async () => {
    const repo = makeMockRepo();
    const scheduler = new CleanupScheduler(repo as any);
    const runOnceSpy = vi.spyOn(scheduler, 'runOnce').mockResolvedValue();
    scheduler.start();
    scheduler.start(); // second call should be a no-op
    await vi.advanceTimersByTimeAsync(5000);
    expect(runOnceSpy).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });
});
