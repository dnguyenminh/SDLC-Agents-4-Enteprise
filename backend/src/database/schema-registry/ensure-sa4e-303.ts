/**
 * SA4E-303 — Cleanup unused edge tables
 * Drops code_dependencies and code_call_graph which are unused in tree-sitter pipeline.
 */

import pino from 'pino';
import { getDbAdapter, getActiveEngine } from '../../admin/db/core.js';

const logger = pino({ name: 'sa4e-303-cleanup' });

export async function ensureSa4e303DropUnusedTables(): Promise<void> {
  const engine = getActiveEngine();
  const adapter = getDbAdapter();
  try {
    await adapter.runAsync(`DROP TABLE IF EXISTS code_dependencies`, []);
    await adapter.runAsync(`DROP TABLE IF EXISTS code_call_graph`, []);
    logger.info('[sa4e-303] Unused tables dropped');
  } catch (err) {
    logger.warn({ err }, '[sa4e-303] Drop tables failed (non-fatal)');
  }
}
