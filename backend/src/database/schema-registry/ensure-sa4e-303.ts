/**
 * SA4E-303 — Cleanup unused edge tables
 * Drops code_dependencies and code_call_graph which are unused in tree-sitter pipeline.
 * Safe to run on every boot (idempotent).
 */

import pino from 'pino';
import { getDbAdapter } from '../../admin/db/core.js';

const logger = pino({ name: 'sa4e-303-cleanup' });

export async function ensureSa4e303DropUnusedTables(): Promise<void> {
  const adapter = getDbAdapter();
  // Check if code_dependencies table exists (use allAsync: runAsync returns only {changes}).
  let depsExists = false;
  try {
    const rows = await adapter.allAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='code_dependencies'`,
    );
    depsExists = rows.length > 0;
  } catch (err) {
    console.debug('[sa4e-303] Table check failed:', (err as Error).message);
  }

  // Check if code_call_graph table exists
  let graphExists = false;
  try {
    const rows = await adapter.allAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='code_call_graph'`,
    );
    graphExists = rows.length > 0;
  } catch (err) {
    console.debug('[sa4e-303] Table check failed:', (err as Error).message);
  }

  if (depsExists) {
    try {
      await adapter.runAsync(`DROP TABLE IF EXISTS code_dependencies`, []);
      logger.info('[sa4e-303] Dropped code_dependencies table');
    } catch (err) {
      logger.warn({ err }, '[sa4e-303] Could not drop code_dependencies (non-fatal)');
    }
  } else {
    console.debug('[sa4e-303] code_dependencies table not found, skipping');
  }

  if (graphExists) {
    try {
      await adapter.runAsync(`DROP TABLE IF EXISTS code_call_graph`, []);
      logger.info('[sa4e-303] Dropped code_call_graph table');
    } catch (err) {
      logger.warn({ err }, '[sa4e-303] Could not drop code_call_graph (non-fatal)');
    }
  } else {
    console.debug('[sa4e-303] code_call_graph table not found, skipping');
  }
}