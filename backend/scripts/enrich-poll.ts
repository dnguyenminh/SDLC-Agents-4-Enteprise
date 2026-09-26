/**
 * Poll enrichment progress for a project until all enrichable symbols are done
 * (or no further progress). Also tops up tasks for any enrichable symbol still
 * missing a task (createTasksForProject is LIMIT 500 per call).
 * Usage: npx tsx scripts/enrich-poll.ts <projectId> [maxMinutes]
 */
import pino from 'pino';
import { getDbAdapter, initAdapters } from '../src/admin/db/core.js';
import { CodeEnrichmentTaskCreator } from '../src/engine/enrichment/CodeEnrichmentTaskCreator.js';

const logger = pino({ level: 'info' });

const CLASS_LIKE = ['class', 'interface', 'enum', 'apex_class'];
const FUNCTION_LIKE = ['function', 'method', 'arrow_function', 'generator', 'constructor', 'trigger'];
const METADATA = ['property', 'sf_field', 'sf_object', 'lwc_component', 'aura_component', 'flow', 'visualforce_page'];
const ENRICHABLE = [...CLASS_LIKE, ...FUNCTION_LIKE, ...METADATA];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function remaining(adapter: any, projectId: string): Promise<{ pending: number; failed: number }> {
  const row = await adapter.getAsync(
    `SELECT COUNT(*) FILTER (WHERE summary IS NULL AND (enrichment_status IS NULL OR enrichment_status <> 'FAILED')) AS pending,
            COUNT(*) FILTER (WHERE enrichment_status = 'FAILED') AS failed
       FROM symbols WHERE project_id = ? AND kind = ANY(?)`,
    [projectId, ENRICHABLE],
  );
  return { pending: Number(row?.pending) || 0, failed: Number(row?.failed) || 0 };
}

async function main(): Promise<void> {
  const projectId = process.argv[2];
  const maxMinutes = parseInt(process.argv[3] || '30', 10);
  if (!projectId) { logger.error('projectId required'); process.exit(1); }
  await initAdapters();
  const adapter: any = getDbAdapter();
  const creator = new CodeEnrichmentTaskCreator(adapter, logger);

  const deadline = Date.now() + maxMinutes * 60_000;
  let lastPending = Infinity;
  let stalls = 0;

  while (Date.now() < deadline) {
    await creator.createTasksForProject(projectId); // top up (idempotent)
    const { pending, failed } = await remaining(adapter, projectId);
    logger.info({ projectId, pending, failed }, '[poll] enrichable symbols remaining');
    if (pending === 0) { logger.info('[poll] DONE — all enrichable symbols have summary'); return; }
    stalls = pending >= lastPending ? stalls + 1 : 0;
    if (stalls >= 6) { logger.warn({ pending, failed }, '[poll] no progress for ~1min — worker may be idle/slow, stopping'); return; }
    lastPending = pending;
    await sleep(10_000);
  }
  logger.warn('[poll] deadline reached');
}

main().then(() => process.exit(0)).catch((e) => { logger.error({ err: e }, 'failed'); process.exit(1); });
