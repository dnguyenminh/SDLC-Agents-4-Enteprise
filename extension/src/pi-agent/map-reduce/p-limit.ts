export interface Limit {
  <T>(fn: () => Promise<T>): Promise<T>;
  activeCount(): number;
  pendingCount(): number;
}

export function pLimit(concurrency: number): Limit {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError('Expected concurrency to be an integer >= 1');
  }
  let active = 0;
  const queue: Array<() => void> = [];

  const limit = (<T>(fn: () => Promise<T>): Promise<T> => {
    const run = async (): Promise<T> => {
      if (active >= concurrency) {
        await new Promise<void>((resolve) => queue.push(resolve));
      }
      active += 1;
      try {
        return await fn();
      } finally {
        active -= 1;
        queue.shift()?.();
      }
    };
    return run();
  }) as Limit;

  limit.activeCount = () => active;
  limit.pendingCount = () => queue.length;
  return limit;
}
