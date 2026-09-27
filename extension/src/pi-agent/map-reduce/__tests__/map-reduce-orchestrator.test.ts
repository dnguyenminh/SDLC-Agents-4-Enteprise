import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MapReduceOrchestrator } from '../map-reduce-orchestrator';
import { TaskDecomposer } from '../../task-decomposer';
import { resetSharedCircuitBreaker } from '../circuit-breaker';
import type { Batch, PartialSummary, SubAgentClient, SubAgentResponse } from '../types';

function files(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `src/file${i}.ts`);
}

interface TrackedSubAgent extends SubAgentClient {
  calls: Array<{ query: string; batch: Batch }>;
  peak: () => number;
}

function trackedSubAgent(delayMs = 5, hangBatchId?: string): TrackedSubAgent {
  const calls: Array<{ query: string; batch: Batch }> = [];
  let active = 0;
  let peak = 0;
  const client: SubAgentClient = {
    async summarizeBatch(query, batch): Promise<SubAgentResponse> {
      active += 1;
      peak = Math.max(peak, active);
      calls.push({ query, batch });
      const delay = hangBatchId === batch.id ? 200 : delayMs;
      await new Promise((resolve) => setTimeout(resolve, delay));
      active -= 1;
      return { summary: `summary of ${batch.id}`, tokens: 10, confidence: 0.9 };
    },
    async synthesize(query, partials): Promise<string> {
      return `ANSWER for "${query}" from ${partials.length} partials`;
    },
  };
  return Object.assign(client, { calls, peak: () => peak });
}

function orchestrator(subAgent: SubAgentClient, config = {}) {
  return new MapReduceOrchestrator({
    subAgent,
    decomposer: new TaskDecomposer(),
    config: { retryBackoffMs: 1, ...config },
  });
}

describe('MapReduceOrchestrator', () => {
  beforeEach(() => {
    resetSharedCircuitBreaker();
  });

  it('TC-001/TC-701: decomposer feeds map workers with batches of 20', async () => {
    const subAgent = trackedSubAgent();
    const result = await orchestrator(subAgent).run('explain architecture', files(100));

    expect(result.batches).toHaveLength(5);
    expect(result.batches.every((b) => b.files.length === 20)).toBe(true);
    expect(subAgent.calls).toHaveLength(5);
  });

  it('TC-002: each batch is summarized by the small model', async () => {
    const subAgent = trackedSubAgent();
    const result = await orchestrator(subAgent).run('explain architecture', files(40));

    expect(result.partials).toHaveLength(2);
    expect(result.partials[0]).toMatchObject({ batchId: 'batch-1', tokens: 10, confidence: 0.9 });
  });

  it('TC-101: parallelism is limited to 5 concurrent sub-agents', async () => {
    const subAgent = trackedSubAgent(20);
    await orchestrator(subAgent).run('query', files(200));

    expect(subAgent.peak()).toBeLessThanOrEqual(5);
  });

  it('TC-003/TC-702: reduce aggregates partial summaries into a final answer', async () => {
    const subAgent = trackedSubAgent();
    const orch = orchestrator(subAgent);
    const partials: PartialSummary[] = [
      { batchId: 'batch-1', summary: 'auth layer', tokens: 10, confidence: 0.9 },
      { batchId: 'batch-2', summary: 'session layer', tokens: 10, confidence: 0.9 },
    ];
    const answer = await orch.reduce('explain architecture', partials);

    expect(answer).toContain('2 partials');
    const final = await orch.run('explain architecture', files(40));
    expect(final.answer).toContain('ANSWER');
  });

  it('TC-102: timed-out batches are skipped while partial results are used', async () => {
    const subAgent = trackedSubAgent(5, 'batch-2');
    const result = await orchestrator(subAgent, { batchTimeoutMs: 30 }).run('query', files(40));

    expect(result.timedOutBatches).toEqual(['batch-2']);
    expect(result.partials.map((p) => p.batchId)).toEqual(['batch-1']);
    expect(result.answer).toContain('1 partials');
  });

  it('retries a failed batch once before giving up', async () => {
    let attempts = 0;
    const subAgent: SubAgentClient = {
      summarizeBatch: vi.fn(async (_q, batch) => {
        attempts += 1;
        if (attempts === 1) throw new Error('transient');
        return { summary: 'recovered', tokens: 5, confidence: 0.8 };
      }),
      synthesize: async () => 'final',
    };
    const result = await orchestrator(subAgent).run('query', files(20));

    expect(subAgent.summarizeBatch).toHaveBeenCalledTimes(2);
    expect(result.partials).toHaveLength(1);
    expect(result.partials[0].summary).toBe('recovered');
  });

  it('REDUCE_FAIL: falls back to concatenated partial summaries', async () => {
    const subAgent: SubAgentClient = {
      summarizeBatch: async (_q, batch) => ({ summary: `s-${batch.id}`, tokens: 1, confidence: 1 }),
      synthesize: async () => {
        throw new Error('synthesis down');
      },
    };
    const orch = orchestrator(subAgent);
    const partials: PartialSummary[] = [
      { batchId: 'b1', summary: 'alpha', tokens: 1, confidence: 1 },
      { batchId: 'b2', summary: 'beta', tokens: 1, confidence: 1 },
    ];
    await expect(orch.reduce('query', partials)).resolves.toBe('alpha\n\nbeta');
  });

  it('TC-301: 100 files complete under 60s without errors (no OOM)', async () => {
    const subAgent = trackedSubAgent(5);
    const started = Date.now();
    const result = await orchestrator(subAgent).run('explain architecture', files(100));
    const elapsed = Date.now() - started;

    expect(elapsed).toBeLessThan(60_000);
    expect(result.answer).toContain('ANSWER');
    expect(result.partials).toHaveLength(5);
    expect(result.elapsedMs).toBeLessThan(60_000);
  });

  it('circuit breaker skips batches after consecutive failures', async () => {
    const subAgent: SubAgentClient = {
      summarizeBatch: async () => {
        throw new Error('sub-agent down');
      },
      synthesize: async () => 'never',
    };
    const result = await orchestrator(subAgent, {
      parallelism: 1,
      retriesPerBatch: 0,
    }).run('query', files(120));

    expect(result.timedOutBatches.length).toBe(3);
    expect(result.skippedBatches.length).toBe(3);
    expect(result.partials).toEqual([]);
    expect(result.answer).toBe('');
  });
});
