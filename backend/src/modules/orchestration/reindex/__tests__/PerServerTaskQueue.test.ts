/**
 * SA4E-42 UT-06..10 — PerServerTaskQueue: serialization, isolation, debounce,
 * fail-soft, latest-wins coalescing (IR-7, IR-9, BR-05/06/07/09).
 */
import { describe, it, expect, vi } from 'vitest';
import pino from 'pino';
import { PerServerTaskQueue } from '../PerServerTaskQueue.js';

const logger = pino({ level: 'silent' });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('PerServerTaskQueue', () => {
  it('UT-06: tasks for one server run strictly sequentially', async () => {
    const q = new PerServerTaskQueue(logger, 0);
    const order: string[] = [];
    const mk = (id: string) => async () => {
      order.push(`${id}:start`);
      await wait(10);
      order.push(`${id}:end`);
    };
    q.enqueue('A', mk('t1'), 0);
    await wait(1);
    q.enqueue('A', mk('t2'), 0);
    await wait(1);
    q.enqueue('A', mk('t3'), 0);
    await q.settle('A');
    expect(order).toEqual([
      't1:start', 't1:end', 't2:start', 't2:end', 't3:start', 't3:end',
    ]);
  });

  it('UT-07: a slow task for A does not block B', async () => {
    const q = new PerServerTaskQueue(logger, 0);
    const events: string[] = [];
    q.enqueue('A', async () => { await wait(50); events.push('A'); }, 0);
    q.enqueue('B', async () => { events.push('B'); }, 0);
    await q.settle('B');
    expect(events).toContain('B');
    expect(events).not.toContain('A'); // A still in flight
    await q.settle('A');
    expect(events).toEqual(['B', 'A']);
  });

  it('UT-08: 5 events within the debounce window collapse to one task', async () => {
    vi.useFakeTimers();
    try {
      const q = new PerServerTaskQueue(logger, 250);
      const run = vi.fn(async () => {});
      for (let i = 0; i < 5; i++) q.enqueue('A', run, 250);
      await vi.advanceTimersByTimeAsync(300);
      expect(run).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('UT-09: a throwing task is caught + logged; the next task still runs', async () => {
    const warn = vi.fn();
    const q = new PerServerTaskQueue({ warn } as any, 0);
    const second = vi.fn(async () => {});
    q.enqueue('A', async () => { throw new Error('boom'); }, 0);
    await wait(1);
    q.enqueue('A', second, 0);
    await q.settle('A');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('UT-10: only the latest event task runs after debounce', async () => {
    vi.useFakeTimers();
    try {
      const q = new PerServerTaskQueue(logger, 250);
      const connect = vi.fn(async () => {});
      const disconnect = vi.fn(async () => {});
      q.enqueue('A', connect, 250);
      q.enqueue('A', disconnect, 250);
      await vi.advanceTimersByTimeAsync(300);
      expect(connect).not.toHaveBeenCalled();
      expect(disconnect).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
