/**
 * CODE_ENRICHMENT task insert helpers.
 * Extracted from CodeEnrichmentTaskCreator (BR-18) — free functions taking the
 * adapter explicitly; no behavior change.
 */

import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import { TaskType, TaskStatus } from '../../../modules/memory/task-queue/models.js';
import { isPegaKind } from '../../../modules/pega/pega-mapping.js';

/**
 * Kinds eligible for enrichment — every non-trivial code symbol must be LLM-enriched.
 * Includes Salesforce-specific kinds (apex_class, trigger) so Apex entities get
 * summary + pseudo code like any other class/function. Trivial symbols (variables,
 * constants, fields, properties) are intentionally excluded.
 */
export const ENRICHABLE_KINDS = new Set([
  // Class-like
  'class', 'interface', 'enum', 'apex_class',
  // Function-like
  'function', 'method', 'arrow_function', 'generator', 'constructor', 'trigger',
  // Salesforce declarative metadata + component properties (summary only, no pseudo code)
  'property', 'sf_field', 'sf_object', 'lwc_component', 'aura_component',
  'flow', 'visualforce_page',
]);

/** Skip if symbol already fully enriched (has summary). */
export async function shouldCreateTask(adapter: DatabaseAdapter, symbolId: number): Promise<boolean> {
  const row = await adapter.getAsync<{ enrichment_status: string | null; summary: string | null }>(
    'SELECT enrichment_status, summary FROM symbols WHERE id = ?',
    [symbolId],
  );
  // Skip only if COMPLETED AND has summary (CODE_ENRICHMENT done, not just TAG_ENRICHMENT)
  return !(row?.enrichment_status === 'COMPLETED' && row?.summary);
}

export async function getSymbolKind(adapter: DatabaseAdapter, symbolId: number): Promise<string | null> {
  const row = await adapter.getAsync<{ kind: string }>(
    'SELECT kind FROM symbols WHERE id = ?', [symbolId],
  );
  return row?.kind ?? null;
}

export async function insertTask(
  adapter: DatabaseAdapter,
  symbolId: number, symbolName: string, kind: string,
  filePath: string, projectId: string,
): Promise<void> {
  // Dedup guard: avoid duplicate PENDING/PROCESSING tasks for same symbol/project
  const exists = await adapter.getAsync<{ id: number }>(
    `SELECT id FROM pending_tasks WHERE task_type = ? AND entry_id = ? AND project_id = ? AND status IN (?, ?) LIMIT 1`,
    [TaskType.CODE_ENRICHMENT, symbolId, projectId, TaskStatus.PENDING, TaskStatus.PROCESSING],
  );
  if (exists) return;

  // SA4E-171: dynamically set workspaceType based on symbol kind
  const payload = JSON.stringify({
    symbolId, symbolName, symbolKind: kind,
    projectId, filePath,
    workspaceType: isPegaKind(kind) ? 'pega' : 'standard',
  });

  const now = new Date().toISOString();
  await adapter.runAsync(
    `INSERT INTO pending_tasks (task_type, entry_id, status, payload, max_retries, project_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [TaskType.CODE_ENRICHMENT, symbolId, TaskStatus.PENDING, payload, 3, projectId, now],
  );
}
