import { describe, it, expect } from 'vitest';
import { pLimit } from '../p-limit';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

describe('pLimit (SA4E-327 parallelism limiter)', () => {
  it('TC-101: never runs more than 5 tasks concurrently', async () => {
    const limit = pLimit(5);
    let active = 0;
    let peak = 0;

    const tasks = Array.from({ length: 20 }, () =>
      limit(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
      })
    );
    await Promise.all(tasks);

    expect(peak).toBe(5);
    expect(limit.activeCount()).toBe(0);
    expect(limit.pendingCount()).toBe(0);
  });

  it('executes queued tasks in FIFO order', async () => {
    const limit = pLimit(1);
    const order: number[] = [];
    const tasks = [1, 2, 3, 4].map((i) =>
      limit(async () => {
        order.push(i);
      })
    );
    await Promise.all(tasks);
    expect(order).toEqual([1, 2, 3, 4]);
  });

  it('supports concurrency of 1 serializing all tasks', async () => {
    const limit = pLimit(1);
    const gate = deferred();
    let secondStarted = false;
    const first = limit(async () => gate.promise);
    const second = limit(async () => {
      secondStarted = true;
    });
    expect(secondStarted).toBe(false);
    gate.resolve();
    await first;
    await second;
    expect(secondStarted).toBe(true);
  });

  it('rejects invalid concurrency values', () => {
    expect(() => pLimit(0)).toThrow(RangeError);
    expect(() => pLimit(-1)).toThrow(RangeError);
    expect(() => pLimit(1.5)).toThrow(RangeError);
  });

  it('propagates task errors and continues processing the queue', async () => {
    const limit = pLimit(1);
    await expect(limit(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    await expect(limit(async () => 'ok')).resolves.toBe('ok');
  });
});
