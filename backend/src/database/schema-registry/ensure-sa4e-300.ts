/**
 * SA4E-300 — Cleanup orphan CODE_ENRICHMENT tasks from Path A (graph-sync)
 *
 * Idempotent cleanup: DELETE pending_tasks where task_type = 'CODE_ENRICHMENT'
 * and (entry_id = 0 OR project_id IS NULL) with status = 'PENDING'.
 * Safe to run on every boot.
 */

import pino from 'pino';
import { getDbAdapter } from '../../admin/db/core.js';

const logger = pino({ name: 'sa4e-300-cleanup' });

export async function ensureSa4e300Cleanup(): Promise<void> {
  const adapter = getDbAdapter();
  try {
    const result = await adapter.runAsync(
      `DELETE FROM pending_tasks
       WHERE task_type = 'CODE_ENRICHMENT'
         AND status = 'PENDING'
         AND (entry_id = 0 OR project_id IS NULL)`,
      [],
    );
    const deleted = result?.changes ?? 0;
    if (deleted > 0) {
      logger.info({ deleted }, '[sa4e-300] Orphan CODE_ENRICHMENT tasks cleaned');
    } else {
      logger.debug('[sa4e-300] No orphan CODE_ENRICHMENT tasks to clean');
    }
  } catch (err) {
    logger.warn({ err }, '[sa4e-300] Cleanup of orphan tasks failed (non-fatal)');
  }
}
