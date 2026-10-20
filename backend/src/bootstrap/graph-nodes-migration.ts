/**
 * SA4E-103: Fix graph_nodes type for existing KB entries (one-time migration).
 * Guarded: skip when either table is missing (fresh DB) instead of erroring.
 * SA4E-104: ensures body_embeddings has project_id + UNIQUE constraint on PG.
 * Non-fatal by design — logged as warning on failure.
 * Extracted verbatim from src/index.ts (BR-18 file-size split).
 */

import type { Logger } from 'pino';

export async function migrateGraphNodesTypes(logger: Logger): Promise<void> {
  try {
    const { getDbAdapter } = await import('../admin/db/core.js');
    const adminAdapter = getDbAdapter();
    if (adminAdapter.isConnected()) {
      const engine = adminAdapter.getEngine();
      const tableExists = async (t: string): Promise<boolean> => {
        try {
          if (engine === 'postgresql') {
            const rows = await adminAdapter.allAsync(
              `SELECT table_name FROM information_schema.tables WHERE table_name = $1`, [t],
            );
            return rows.length > 0;
          }
          const rows = await adminAdapter.allAsync(
            `SELECT name FROM sqlite_master WHERE type='table' AND name=?`, [t],
          );
          return rows.length > 0;
        } catch {
          return false;
        }
      };
      const hasGraphNodes = await tableExists('graph_nodes');
      const hasEntries = await tableExists('knowledge_entries');
      if (!hasGraphNodes || !hasEntries) {
        logger.info('graph_nodes type migration skipped (required tables missing)');
      } else {
        // SA4E-104: Ensure body_embeddings has project_id + UNIQUE constraint on PG
        if (engine === 'postgresql') {
          const { ensurePostgresIndexSchema } = await import('../database/migration/pg-schema-ensure.js');
          await ensurePostgresIndexSchema(adminAdapter);
        }
        if (engine === 'postgresql') {
          await adminAdapter.runAsync(
            `UPDATE graph_nodes SET type = ke.type FROM knowledge_entries ke WHERE graph_nodes.entry_id = 'kb-entry:' || ke.id::text AND graph_nodes.type = 'KNOWLEDGE_ENTRY'`, [],
          );
        } else {
          await adminAdapter.runAsync(
            `UPDATE graph_nodes SET type = (SELECT ke.type FROM knowledge_entries ke WHERE 'kb-entry:' || ke.id = graph_nodes.entry_id) WHERE entry_id LIKE 'kb-entry:%' AND type = 'KNOWLEDGE_ENTRY'`, [],
          );
        }
        logger.info('Fixed graph_nodes types from KNOWLEDGE_ENTRY to actual entry types');
      }
    }
  } catch (err) {
    logger.warn({ err }, 'graph_nodes type migration skipped (non-fatal)');
  }
}
