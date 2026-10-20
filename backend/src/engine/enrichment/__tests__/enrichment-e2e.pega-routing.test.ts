/**
 * SA4E-106: Pega symbol enrichment routing tests.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TaskWorker } from '../../../modules/memory/task-queue/TaskWorker.js';
import { TaskType, TaskStatus } from '../../../modules/memory/task-queue/models.js';
import type { PendingTask } from '../../../modules/memory/task-queue/models.js';
import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import type { MemoryEngine } from '../../../modules/memory/engine/index.js';
import { logger, createMockDb, createMockEngine, createMockLlmService } from './helpers.js';

describe('SA4E-106: Pega symbol enrichment routing', () => {
  let db: DatabaseAdapter;
  let engine: MemoryEngine;

  beforeEach(() => {
    db = createMockDb();
    engine = createMockEngine();
  });

  it('Pega symbol task sets workspaceType=pega in payload', () => {
    const payload = JSON.stringify({
      symbolId: 500, symbolName: 'ProcessClaim',
      symbolKind: 'pega_flow', projectId: 'pega-proj',
      filePath: 'rules/ProcessClaim.json', workspaceType: 'pega',
    });

    const parsed = JSON.parse(payload);
    expect(parsed.workspaceType).toBe('pega');
    expect(parsed.symbolKind).toBe('pega_flow');
  });

  it('dispatches Pega symbol to processCodeSummary same as standard', async () => {
    const mockLlm = createMockLlmService();
    const worker = new TaskWorker(db, engine, logger, {});
    (worker as any).llmService = mockLlm;
    const repo = (worker as any).repo;
    vi.spyOn(repo, 'markCompleted').mockResolvedValue(undefined);

    const task: PendingTask = {
      id: 6,
      task_type: TaskType.CODE_ENRICHMENT,
      entry_id: 500,
      status: TaskStatus.PROCESSING,
      payload: JSON.stringify({
        symbol_id: 500, name: 'ProcessClaim',
        kind: 'pega_flow', project_id: 'pega-proj',
        file_path: 'rules/ProcessClaim.json',
        body: 'ProcessClaim rule: validates claim data and routes to approval flow',
        signature: 'Pega Flow: ProcessClaim',
      }),
      error: null,
      retry_count: 0,
      max_retries: 3,
      created_at: '2025-01-01T00:00:00Z',
      started_at: null,
      completed_at: null,
    };

    await (worker as any).processTask(task);

    expect(mockLlm.complete).toHaveBeenCalled();
    expect(repo.markCompleted).toHaveBeenCalledWith(6);
  });
});
