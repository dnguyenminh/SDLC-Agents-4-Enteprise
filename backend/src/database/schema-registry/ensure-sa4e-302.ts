import pino from 'pino';
import { getDbAdapter, getActiveEngine } from '../../admin/db/core.js';

const logger = pino({ name: 'sa4e-302-migration' });

export async function ensureSa4e302UniqueGraphEdges(): Promise<void> {
  const engine = getActiveEngine();
  const adapter = getDbAdapter();
  try {
    if (engine === 'postgresql') {
      await adapter.runAsync(`CREATE UNIQUE INDEX IF NOT EXISTS ux_graph_edges_source_target ON graph_edges(source, target)`, []);
    } else {
      // SQLite already has UNIQUE(source,target) in schema
    }
    logger.info('[sa4e-302] Unique index on graph_edges ensured');
  } catch (err) {
    logger.warn({ err }, '[sa4e-302] Failed to ensure unique index (non-fatal)');
  }
}
