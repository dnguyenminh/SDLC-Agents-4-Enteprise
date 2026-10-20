/**
 * SA4E-106: handleTaskError — non-retryable error patterns.
 * Verifies invalid_payload and symbol_not_found are marked failed immediately.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TaskWorker } from '../TaskWorker.js';
import type { DatabaseAdapter } from '../../../../database/adapters/DatabaseAdapter.js';
import type { MemoryEngine } from '../../engine/index.js';
import pino from 'pino';
import { createMockDb, createMockEngine } from './helpers.js';

const logger = pino({ level: 'silent' });
const testConfig = {
  enableContextChain: true,
  contextChainMaxLength: 500,
  structuredMapMaxSize: 102400,
};

describe('SA4E-106: handleTaskError non-retryable patterns', () => {
  let db: DatabaseAdapter;
  let engine: MemoryEngine;

  beforeEach(() => {
    db = createMockDb();
    engine = createMockEngine(new Map());
  });

  function createWorkerWithSpies() {
    const worker = new TaskWorker(db, engine, logger, testConfig);
    const repo = (worker as any).repo;
    // Spy on repo methods to track calls without executing real SQL
    vi.spyOn(repo, 'markFailed').mockResolvedValue(undefined);
    vi.spyOn(repo, 'resetForRetry').mockResolvedValue(undefined);
    return { worker, repo };
  }

  function createFakeTask(retryCount = 0, maxRetries = 3): any {
    return { id: 42, retry_count: retryCount, max_retries: maxRetries };
  }

  it('marks task failed immediately for invalid_payload error', async () => {
    const { worker, repo } = createWorkerWithSpies();
    const task = createFakeTask();
    const error = new Error('invalid_payload: symbolId is required');

    await (worker as any).handleTaskError(task, error);

    expect(repo.markFailed).toHaveBeenCalledWith(42, error.message);
    expect(repo.resetForRetry).not.toHaveBeenCalled();
  });

  it('marks task failed immediately for symbol_not_found error', async () => {
    const { worker, repo } = createWorkerWithSpies();
    const task = createFakeTask();
    const error = new Error('symbol_not_found: 999');

    await (worker as any).handleTaskError(task, error);

    expect(repo.markFailed).toHaveBeenCalledWith(42, error.message);
    expect(repo.resetForRetry).not.toHaveBeenCalled();
  });

  it('marks task failed immediately for invalid_json error', async () => {
    const { worker, repo } = createWorkerWithSpies();
    const task = createFakeTask();
    const error = new Error('invalid_json: unexpected token');

    await (worker as any).handleTaskError(task, error);

    expect(repo.markFailed).toHaveBeenCalledWith(42, error.message);
    expect(repo.resetForRetry).not.toHaveBeenCalled();
  });

  it('marks task failed immediately for entry_not_found error', async () => {
    const { worker, repo } = createWorkerWithSpies();
    const task = createFakeTask();
    const error = new Error('entry_not_found');

    await (worker as any).handleTaskError(task, error);

    expect(repo.markFailed).toHaveBeenCalledWith(42, error.message);
    expect(repo.resetForRetry).not.toHaveBeenCalled();
  });

  it('resets for retry on transient error with retries remaining', async () => {
    const { worker, repo } = createWorkerWithSpies();
    const task = createFakeTask(0, 3);
    const error = new Error('llm_timeout');

    await (worker as any).handleTaskError(task, error);

    expect(repo.markFailed).toHaveBeenCalledWith(42, error.message);
    expect(repo.resetForRetry).toHaveBeenCalledWith(42);
  });

  it('marks failed when max retries exhausted for transient error', async () => {
    const { worker, repo } = createWorkerWithSpies();
    const task = createFakeTask(2, 3); // retry_count + 1 >= max_retries
    const error = new Error('llm_timeout');

    await (worker as any).handleTaskError(task, error);

    expect(repo.markFailed).toHaveBeenCalledWith(42, error.message);
    expect(repo.resetForRetry).not.toHaveBeenCalled();
  });

  it('does NOT resetForRetry for any non-retryable data errors', async () => {
    const { worker, repo } = createWorkerWithSpies();
    const task = createFakeTask();

    // symbol_not_found should not trigger retry
    await (worker as any).handleTaskError(task, new Error('symbol_not_found: 999'));
    expect(repo.markFailed).toHaveBeenCalledWith(42, 'symbol_not_found: 999');
    expect(repo.resetForRetry).not.toHaveBeenCalled();

    // Reset spies for next call
    vi.mocked(repo.markFailed).mockClear();
    vi.mocked(repo.resetForRetry).mockClear();

    // entry_not_found should not trigger retry
    await (worker as any).handleTaskError(task, new Error('entry_not_found'));
    expect(repo.markFailed).toHaveBeenCalledWith(42, 'entry_not_found');
    expect(repo.resetForRetry).not.toHaveBeenCalled();

    vi.mocked(repo.markFailed).mockClear();
    vi.mocked(repo.resetForRetry).mockClear();

    // invalid_payload should not trigger retry
    await (worker as any).handleTaskError(task, new Error('invalid_payload: bad'));
    expect(repo.markFailed).toHaveBeenCalledWith(42, 'invalid_payload: bad');
    expect(repo.resetForRetry).not.toHaveBeenCalled();
  });

  it('DOES resetForRetry for transient LLM errors when retries remaining', async () => {
    const { worker, repo } = createWorkerWithSpies();
    const task = createFakeTask(0, 3); // retry_count=0, max_retries=3

    await (worker as any).handleTaskError(task, new Error('llm_timeout'));

    // Transient error: markFailed AND resetForRetry (retries still available)
    expect(repo.markFailed).toHaveBeenCalledWith(42, 'llm_timeout');
    expect(repo.resetForRetry).toHaveBeenCalledWith(42);
  });
});
