/**
 * One-off audit + backfill: ensure EVERY enrichable symbol in a project gets
 * LLM enrichment. Resets incomplete symbols and (re)creates enrichment tasks.
 * Usage:
 *   npx tsx scripts/enrich-audit.ts <projectId>            # audit + reset + create tasks
 *   npx tsx scripts/enrich-audit.ts <projectId> --report   # audit only, no writes
 */
import pino from 'pino';
import { getDbAdapter, initAdapters } from '../src/admin/db/core.js';
import { CodeEnrichmentTaskCreator } from '../src/engine/enrichment/CodeEnrichmentTaskCreator.js';

const logger = pino({ level: 'info' });

// Must mirror ENRICHABLE_KINDS in CodeEnrichmentTaskCreator.ts
const CLASS_LIKE = ['class', 'interface', 'enum', 'apex_class'];
const FUNCTION_LIKE = ['function', 'method', 'arrow_function', 'generator', 'constructor', 'trigger'];
const METADATA = ['property', 'sf_field', 'sf_object', 'lwc_component', 'aura_component', 'flow', 'visualforce_page'];
const ENRICHABLE = [...CLASS_LIKE, ...FUNCTION_LIKE, ...METADATA];
// Kinds that should also carry pseudo_code (class-like + function-like); metadata does not.
const PSEUDO_KINDS = [...CLASS_LIKE, ...FUNCTION_LIKE];

async function report(adapter: any, projectId: string): Promise<void> {
  const perKind = await adapter.allAsync(
    `SELECT kind, COUNT(*) AS total,
            COUNT(*) FILTER (WHERE summary IS NOT NULL) AS with_summary,
            COUNT(*) FILTER (WHERE pseudo_code IS NOT NULL) AS with_pseudo,
            COUNT(*) FILTER (WHERE enrichment_status = 'FAILED') AS failed
       FROM symbols WHERE project_id = ?
      GROUP BY kind ORDER BY total DESC`,
    [projectId],
  );
  logger.info({ projectId, perKind }, '[audit] per-kind coverage');
}

async function main(): Promise<void> {
  const projectId = process.argv[2];
  const reportOnly = process.argv[3] === '--report';
  if (!projectId) { logger.error('projectId required'); process.exit(1); }
  await initAdapters();
  const adapter: any = getDbAdapter();

  await report(adapter, projectId);
  if (reportOnly) return;

  // Reset every enrichable symbol that is not fully enriched:
  //  - missing summary (never enriched), OR
  //  - class/function-like missing pseudo_code (enriched before pseudo support)
  const resetRes = await adapter.runAsync(
    `UPDATE symbols
        SET enrichment_status = NULL, summary = NULL, pseudo_code = NULL,
            llm_tags = NULL, enriched_at = NULL
      WHERE project_id = ? AND kind = ANY(?)
        AND ( summary IS NULL
              OR (kind = ANY(?) AND pseudo_code IS NULL) )`,
    [projectId, ENRICHABLE, PSEUDO_KINDS],
  );
  logger.info({ projectId, reset: resetRes?.changes }, '[audit] symbols reset for (re)enrichment');

  const creator = new CodeEnrichmentTaskCreator(adapter, logger);
  const created = await creator.createTasksForProject(projectId);
  logger.info({ projectId, created }, '[audit] enrichment tasks created (worker will process)');

  await report(adapter, projectId);
}

main().then(() => process.exit(0)).catch((e) => { logger.error({ err: e }, 'failed'); process.exit(1); });
