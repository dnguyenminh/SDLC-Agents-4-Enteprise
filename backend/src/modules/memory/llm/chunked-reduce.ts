export interface ChunkedReduceOptions<T, C> {
  chunks: C[];
  mapFn: (chunk: C, index: number, ctx: { attempt: number }) => Promise<T>;
  mergeFn: (results: T[]) => T;
  maxRetriesPerChunk?: number;
  onChunkFailure?: (chunk: C, index: number, err: unknown, attempt: number) => 'retry' | 'abort' | 'degrade';
  backoffMs?: (attempt: number) => number;
}

export async function chunkedReduce<T, C>(opts: ChunkedReduceOptions<T, C>): Promise<T> {
  const { chunks, mapFn, mergeFn, maxRetriesPerChunk = 2, onChunkFailure, backoffMs = (a) => 200 * 2 ** a } = opts;
  const results: T[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    let attempt = 0;
    while (true) {
      try {
        const res = await mapFn(chunk, i, { attempt });
        results.push(res);
        break;
      } catch (err) {
        const decision = onChunkFailure?.(chunk, i, err, attempt);
        if (decision === 'abort') throw err;
        if (decision === 'degrade' || attempt >= maxRetriesPerChunk) {
          // degrade: push empty result
          results.push({} as T);
          break;
        }
        attempt++;
        await new Promise(r => setTimeout(r, backoffMs(attempt)));
      }
    }
  }
  return mergeFn(results);
}
