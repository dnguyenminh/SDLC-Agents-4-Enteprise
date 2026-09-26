import { logger } from '../logger';
import type { Batch } from './map-reduce/types';

export interface DecomposeOptions {
  batchSize?: number;
  maxBatchTokens?: number;
}

const DEFAULT_BATCH_SIZE = 20;
const DEFAULT_MAX_BATCH_TOKENS = 4000;

export class TaskDecomposer {
  decompose(query: string, files: string[], options: DecomposeOptions = {}): Batch[] {
    const size = options.batchSize ?? DEFAULT_BATCH_SIZE;
    const maxTokens = options.maxBatchTokens ?? DEFAULT_MAX_BATCH_TOKENS;
    if (!Number.isInteger(size) || size < 1) {
      logger.warn(`Invalid batchSize ${size}, falling back to single batch`);
      return [this.singleBatch(query, files, maxTokens)];
    }
    try {
      if (!Array.isArray(files)) throw new Error(`files must be an array, received ${typeof files}`);
      const unique = dedupePaths(files);
      if (unique.length === 0) return [];
      return this.splitIntoBatches(query, unique, size, maxTokens);
    } catch (err) {
      logger.warn('Decomposition failed, falling back to single batch', {
        error: (err as Error).message,
      });
      return [this.singleBatch(query, Array.isArray(files) ? files : [], maxTokens)];
    }
  }

  private splitIntoBatches(query: string, files: string[], size: number, maxTokens: number): Batch[] {
    const total = Math.ceil(files.length / size);
    const batches: Batch[] = [];
    for (let index = 0; index < total; index += 1) {
      const slice = files.slice(index * size, (index + 1) * size);
      batches.push({
        id: `batch-${index + 1}`,
        files: slice,
        subQuery: `${query} [batch ${index + 1}/${total}: ${slice.length} files]`,
        maxTokens,
      });
    }
    return batches;
  }

  private singleBatch(query: string, files: string[], maxTokens: number): Batch {
    return { id: 'batch-1', files: dedupePaths(files), subQuery: query ?? '', maxTokens };
  }
}

function dedupePaths(files: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const file of files ?? []) {
    const key = file.replace(/\\/g, '/').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(file);
  }
  return out;
}
