/**
 * One-off: inspect what content SF-specific symbol kinds actually carry,
 * so enrichment prompts can be grounded (not fabricated).
 * Usage: npx tsx scripts/inspect-kinds.ts <projectId>
 */
import pino from 'pino';
import { getDbAdapter, initAdapters } from '../src/admin/db/core.js';

const logger = pino({ level: 'info' });
const KINDS = ['property', 'lwc_component', 'sf_field', 'flow', 'sf_object', 'aura_component'];

async function main(): Promise<void> {
  const projectId = process.argv[2];
  await initAdapters();
  const adapter: any = getDbAdapter();
  for (const kind of KINDS) {
    const rows = await adapter.allAsync(
      `SELECT s.name, s.signature, s.doc_comment, s.parent_symbol, f.relative_path,
              (SELECT COUNT(*) FROM body_embeddings b WHERE b.symbol_id = s.id) AS has_body
         FROM symbols s LEFT JOIN files f ON s.file_id = f.id
        WHERE s.project_id = ? AND s.kind = ? LIMIT 3`,
      [projectId, kind],
    );
    logger.info({ kind, samples: rows }, `[inspect] ${kind}`);
  }
}
main().then(() => process.exit(0)).catch((e) => { logger.error({ err: e }, 'failed'); process.exit(1); });
