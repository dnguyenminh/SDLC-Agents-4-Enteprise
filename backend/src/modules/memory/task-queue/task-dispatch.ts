/**
 * Task dispatch + unenriched-symbol scan — extracted from TaskWorker.
 * Routes a claimed pending task to its handler by task_type.
 */
import type { PendingTask } from './models.js';
import { TaskType } from './models.js';
import type { TaskDispatchDeps } from './worker-context.js';

export async function dispatchTask(deps: TaskDispatchDeps, task: PendingTask): Promise<void> {
  try {
    // CODE_ENRICHMENT tasks use symbols table, not knowledge_entries
    if (task.task_type === TaskType.CODE_ENRICHMENT) {
      // SA4E-107: Delegate to CodeEnrichmentHandler (loads body from DB, uses proper strategy)
      if (deps.codeEnrichmentHandler) {
        await deps.codeEnrichmentHandler.enrichSymbol(task);
        await deps.repo.markCompleted(task.id);
        return;
      }
      // Fallback: legacy processCodeSummary (payload must contain body field)
      let payload: any;
      try { payload = JSON.parse(task.payload); }
      catch { deps.repo.markFailed(task.id, 'invalid_json_payload'); return; }
      await deps.processCodeSummary(task, payload);
      return;
    }
    const entry = await deps.engine.findById(task.entry_id);
    if (!entry) { await deps.repo.markFailed(task.id, 'entry_not_found'); return; }
    let payload: any;
    try { payload = JSON.parse(task.payload); }
    catch { deps.repo.markFailed(task.id, 'invalid_json_payload'); return; }
    switch (task.task_type) {
      case TaskType.TAG_ENRICHMENT:
        await deps.processTagEnrichment(task, payload);
        break;
      case TaskType.VECTOR_EMBEDDING:
        await deps.processVectorEmbedding(task, payload);
        break;
      default:
        await deps.repo.markFailed(task.id, `unknown_task_type: ${task.task_type}`);
    }
  } catch (err: any) { await deps.handleTaskError(task, err); }
}

/**
 * SA4E-209: Scan for unenriched symbols and create tasks automatically.
 * Runs when queue is idle (consecutiveEmpty hits threshold). Non-fatal.
 */
export async function scanForUnenrichedSymbols(
  engine: TaskDispatchDeps['engine'],
  logger: TaskDispatchDeps['logger'],
): Promise<void> {
  try {
    const { CodeEnrichmentTaskCreator } = await import('../../../engine/enrichment/CodeEnrichmentTaskCreator.js');
    const adapter = engine.getAdapter();
    const creator = new CodeEnrichmentTaskCreator(adapter, logger);
    // Find all projects with unenriched symbols
    const projects = await adapter.allAsync<{ project_id: string }>(
      `SELECT DISTINCT project_id FROM symbols
       WHERE (enrichment_status IS NULL OR enrichment_status = '')
         AND kind NOT IN ('variable', 'import', 'namespace')
       LIMIT 10`,
      [],
    );
    for (const { project_id } of projects) {
      const created = await creator.createTasksForProject(project_id);
      if (created > 0) {
        logger.info({ created, projectId: project_id }, '[TaskWorker] Auto-created enrichment tasks for unenriched symbols');
      }
    }
  } catch (err) {
    logger.debug({ err }, '[TaskWorker] Unenriched symbol scan failed (non-fatal)');
  }
}
