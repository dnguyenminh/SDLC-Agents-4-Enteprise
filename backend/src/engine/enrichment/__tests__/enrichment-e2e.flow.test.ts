/**
 * SA4E-106: End-to-end enrichment flow integration test.
 * Verifies: TaskWorker receives CODE_ENRICHMENT task -> processCodeSummary
 * -> uses llmService to generate summary -> marks task completed.
 *
 * SA4E-174: processCodeSummary replaced enrichSymbol — handler is a no-op,
 * llmService is used directly.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TaskWorker } from '../../../modules/memory/task-queue/TaskWorker.js';
import { TaskType, TaskStatus } from '../../../modules/memory/task-queue/models.js';
import type { PendingTask } from '../../../modules/memory/task-queue/models.js';
import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import type { MemoryEngine } from '../../../modules/memory/engine/index.js';
import { logger, createMockDb, createMockEngine, createMockLlmService } from './helpers.js';

describe('SA4E-106: End-to-end enrichment flow', () => {
  let db: DatabaseAdapter;
  let engine: MemoryEngine;

  beforeEach(() => {
    db = createMockDb();
    engine = createMockEngine();
  });

  it('dispatches CODE_ENRICHMENT task to processCodeSummary and marks completed', async () => {
    const mockLlm = createMockLlmService();
    const worker = new TaskWorker(db, engine, logger, {});
    (worker as any).llmService = mockLlm;
    const repo = (worker as any).repo;
    vi.spyOn(repo, 'markCompleted').mockResolvedValue(undefined);

    const task: PendingTask = {
      id: 1,
      task_type: TaskType.CODE_ENRICHMENT,
      entry_id: 100,
      status: TaskStatus.PROCESSING,
      payload: JSON.stringify({
        symbol_id: 100, name: 'MyClass', kind: 'class',
        project_id: 'proj-1', file_path: 'src/a.ts',
        body: 'class MyClass { constructor() {} method() { return 42; } }',
        signature: 'class MyClass',
      }),
      error: null,
      retry_count: 0,
      max_retries: 3,
      created_at: '2025-01-01T00:00:00Z',
      started_at: null,
      completed_at: null,
    };

    await (worker as any).processTask(task);

    // processCodeSummary calls llmService.complete then markCompleted
    expect(mockLlm.complete).toHaveBeenCalled();
    expect(repo.markCompleted).toHaveBeenCalledWith(1);
  });

  it('resets for retry when llmService not injected', async () => {
    const worker = new TaskWorker(db, engine, logger, {});
    const repo = (worker as any).repo;
    vi.spyOn(repo, 'resetForRetry').mockResolvedValue(undefined);
    vi.spyOn(repo, 'markCompleted').mockResolvedValue(undefined);

    const task: PendingTask = {
      id: 2,
      task_type: TaskType.CODE_ENRICHMENT,
      entry_id: 200,
      status: TaskStatus.PROCESSING,
      payload: JSON.stringify({
        symbol_id: 200, name: 'fn', kind: 'function',
        project_id: 'proj-1', file_path: 'src/b.ts',
        body: 'function fn() { return 1; }',
        signature: 'function fn()',
      }),
      error: null,
      retry_count: 0,
      max_retries: 3,
      created_at: '2025-01-01T00:00:00Z',
      started_at: null,
      completed_at: null,
    };

    await (worker as any).processTask(task);

    expect(repo.resetForRetry).toHaveBeenCalledWith(2);
  });

  it('marks completed when body is too short (no LLM call)', async () => {
    const mockLlm = createMockLlmService();
    const worker = new TaskWorker(db, engine, logger, {});
    (worker as any).llmService = mockLlm;
    const repo = (worker as any).repo;
    vi.spyOn(repo, 'markCompleted').mockResolvedValue(undefined);

    const task: PendingTask = {
      id: 3,
      task_type: TaskType.CODE_ENRICHMENT,
      entry_id: 300,
      status: TaskStatus.PROCESSING,
      payload: JSON.stringify({
        symbol_id: 300, name: 'tiny', kind: 'function',
        project_id: 'proj-1', file_path: 'src/c.ts',
        body: 'short',
        signature: null,
      }),
      error: null,
      retry_count: 0,
      max_retries: 3,
      created_at: '2025-01-01T00:00:00Z',
      started_at: null,
      completed_at: null,
    };

    await (worker as any).processTask(task);

    // body < 20 chars: skip LLM, mark completed
    expect(mockLlm.complete).not.toHaveBeenCalled();
    expect(repo.markCompleted).toHaveBeenCalledWith(3);
  });

  it('marks completed even when LLM throws (non-fatal catch)', async () => {
    const mockLlm = createMockLlmService();
    mockLlm.complete.mockRejectedValue(new Error('LLM unreachable'));
    const worker = new TaskWorker(db, engine, logger, {});
    (worker as any).llmService = mockLlm;
    const repo = (worker as any).repo;
    vi.spyOn(repo, 'markCompleted').mockResolvedValue(undefined);

    const task: PendingTask = {
      id: 4,
      task_type: TaskType.CODE_ENRICHMENT,
      entry_id: 400,
      status: TaskStatus.PROCESSING,
      payload: JSON.stringify({
        symbol_id: 400, name: 'broken', kind: 'function',
        project_id: 'proj-1', file_path: 'src/d.ts',
        body: 'function broken() { throw new Error("fail"); }',
        signature: 'function broken()',
      }),
      error: null,
      retry_count: 0,
      max_retries: 3,
      created_at: '2025-01-01T00:00:00Z',
      started_at: null,
      completed_at: null,
    };

    await (worker as any).processTask(task);

    // LLM error is caught internally (non-fatal), task still completed
    expect(repo.markCompleted).toHaveBeenCalledWith(4);
  });

  it('marks failed for invalid JSON payload', async () => {
    const worker = new TaskWorker(db, engine, logger, {});
    const repo = (worker as any).repo;
    vi.spyOn(repo, 'markFailed').mockResolvedValue(undefined);

    const task: PendingTask = {
      id: 5,
      task_type: TaskType.CODE_ENRICHMENT,
      entry_id: 500,
      status: TaskStatus.PROCESSING,
      payload: 'NOT_JSON',
      error: null,
      retry_count: 0,
      max_retries: 3,
      created_at: '2025-01-01T00:00:00Z',
      started_at: null,
      completed_at: null,
    };

    await (worker as any).processTask(task);

    expect(repo.markFailed).toHaveBeenCalledWith(5, 'invalid_json_payload');
  });
});
