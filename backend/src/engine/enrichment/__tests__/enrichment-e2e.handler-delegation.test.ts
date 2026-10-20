/**
 * SA4E-209: CodeEnrichmentHandler delegation tests (pega_flow fix).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TaskWorker } from '../../../modules/memory/task-queue/TaskWorker.js';
import { TaskType, TaskStatus } from '../../../modules/memory/task-queue/models.js';
import type { PendingTask } from '../../../modules/memory/task-queue/models.js';
import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import type { MemoryEngine } from '../../../modules/memory/engine/index.js';
import { logger, createMockDb, createMockEngine, createMockLlmService } from './helpers.js';

describe('SA4E-209: CodeEnrichmentHandler delegation (pega_flow fix)', () => {
  let db: DatabaseAdapter;
  let engine: MemoryEngine;

  beforeEach(() => {
    db = createMockDb();
    engine = createMockEngine();
  });

  it('delegates to CodeEnrichmentHandler.enrichSymbol() when handler is wired', async () => {
    const worker = new TaskWorker(db, engine, logger, {});
    const repo = (worker as any).repo;
    vi.spyOn(repo, 'markCompleted').mockResolvedValue(undefined);

    // Wire handler — simulates LLMInitializer wiring CodeEnrichmentHandler
    const mockHandler = { enrichSymbol: vi.fn().mockResolvedValue(undefined) };
    worker.setCodeEnrichmentHandler(mockHandler);

    // Payload matches what PegaSymbolSync creates (NO body field)
    const task: PendingTask = {
      id: 10,
      task_type: TaskType.CODE_ENRICHMENT,
      entry_id: 1000,
      status: TaskStatus.PROCESSING,
      payload: JSON.stringify({
        symbolId: 1000, symbolName: 'PrepareOffer_0',
        symbolKind: 'pega_flow', projectId: 'pega-hr',
        filePath: 'pega://TGB-HRApps-Work-Candidate/flow/PrepareOffer_0',
        workspaceType: 'pega',
        pegaClass: 'TGB-HRApps-Work-Candidate',
        pegaRuleset: 'HRAppsV2',
      }),
      error: null,
      retry_count: 0,
      max_retries: 3,
      created_at: '2025-01-01T00:00:00Z',
      started_at: null,
      completed_at: null,
    };

    await (worker as any).processTask(task);

    // Handler should be called with the full task (it loads body from DB itself)
    expect(mockHandler.enrichSymbol).toHaveBeenCalledWith(task);
    expect(repo.markCompleted).toHaveBeenCalledWith(10);
  });

  it('falls back to legacy processCodeSummary when handler NOT wired', async () => {
    const mockLlm = createMockLlmService();
    const worker = new TaskWorker(db, engine, logger, {});
    (worker as any).llmService = mockLlm;
    // Do NOT wire handler — simulates old behavior
    const repo = (worker as any).repo;
    vi.spyOn(repo, 'markCompleted').mockResolvedValue(undefined);

    // Payload without body field (like PegaSymbolSync creates)
    const task: PendingTask = {
      id: 11,
      task_type: TaskType.CODE_ENRICHMENT,
      entry_id: 1100,
      status: TaskStatus.PROCESSING,
      payload: JSON.stringify({
        symbolId: 1100, symbolName: 'PrepareOffer_0',
        symbolKind: 'pega_flow', projectId: 'pega-hr',
        filePath: 'pega://TGB-HRApps-Work-Candidate/flow/PrepareOffer_0',
        workspaceType: 'pega',
      }),
      error: null,
      retry_count: 0,
      max_retries: 3,
      created_at: '2025-01-01T00:00:00Z',
      started_at: null,
      completed_at: null,
    };

    await (worker as any).processTask(task);

    // Legacy path: body is undefined → marks completed without LLM call
    expect(mockLlm.complete).not.toHaveBeenCalled();
    expect(repo.markCompleted).toHaveBeenCalledWith(11);
  });

  it('handles handler error via handleTaskError (retry/fail)', async () => {
    const worker = new TaskWorker(db, engine, logger, {});
    const repo = (worker as any).repo;
    vi.spyOn(repo, 'markFailed').mockResolvedValue(undefined);
    vi.spyOn(repo, 'resetForRetry').mockResolvedValue(undefined);

    const mockHandler = {
      enrichSymbol: vi.fn().mockRejectedValue(new Error('llm_timeout')),
    };
    worker.setCodeEnrichmentHandler(mockHandler);

    const task: PendingTask = {
      id: 12,
      task_type: TaskType.CODE_ENRICHMENT,
      entry_id: 1200,
      status: TaskStatus.PROCESSING,
      payload: JSON.stringify({
        symbolId: 1200, symbolName: 'SomeFlow',
        symbolKind: 'pega_flow', projectId: 'p1',
        filePath: 'pega://Work/flow/SomeFlow',
        workspaceType: 'pega',
      }),
      error: null,
      retry_count: 0,
      max_retries: 3,
      created_at: '2025-01-01T00:00:00Z',
      started_at: null,
      completed_at: null,
    };

    await (worker as any).processTask(task);

    // Error caught by handleTaskError → marks failed + resets for retry
    expect(mockHandler.enrichSymbol).toHaveBeenCalled();
    expect(repo.markFailed).toHaveBeenCalledWith(12, 'llm_timeout');
    expect(repo.resetForRetry).toHaveBeenCalledWith(12);
  });
});
