/** Diagnose why enrichment stalled: task queue state + unenriched symbols w/o tasks. */
import pino from 'pino';
import { getDbAdapter, initAdapters } from '../src/admin/db/core.js';

const logger = pino({ level: 'info' });
const CLASS_LIKE = ['class', 'interface', 'enum', 'apex_class'];
const FUNCTION_LIKE = ['function', 'method', 'arrow_function', 'generator', 'constructor', 'trigger'];
const METADATA = ['property', 'sf_field', 'sf_object', 'lwc_component', 'aura_component', 'flow', 'visualforce_page'];
const ENRICHABLE = [...CLASS_LIKE, ...FUNCTION_LIKE, ...METADATA];

async function main(): Promise<void> {
  const projectId = process.argv[2];
  await initAdapters();
  const adapter: any = getDbAdapter();

  const tasks = await adapter.allAsync(
    `SELECT status, task_type, COUNT(*) AS n FROM pending_tasks
      WHERE payload LIKE ? GROUP BY status, task_type ORDER BY n DESC`,
    [`%${projectId}%`],
  );
  logger.info({ tasks }, '[diag] pending_tasks by status/type (payload match)');

  // Unenriched enrichable symbols grouped by kind
  const byKind = await adapter.allAsync(
    `SELECT kind, COUNT(*) AS n FROM symbols
      WHERE project_id = ? AND kind = ANY(?) AND summary IS NULL
      GROUP BY kind ORDER BY n DESC`,
    [projectId, ENRICHABLE],
  );
  logger.info({ byKind }, '[diag] unenriched enrichable symbols by kind');

  // Of those, how many have NO pending task row?
  const noTask = await adapter.getAsync(
    `SELECT COUNT(*) AS n FROM symbols s
      WHERE s.project_id = ? AND s.kind = ANY(?) AND s.summary IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM pending_tasks t
           WHERE t.task_type = 'CODE_ENRICHMENT' AND t.payload LIKE '%"symbolId":' || s.id || '%'
        )`,
    [projectId, ENRICHABLE],
  );
  logger.info({ noTask: noTask?.n }, '[diag] unenriched symbols WITHOUT a task row');

  // Sample statuses of symbols still null
  const statuses = await adapter.allAsync(
    `SELECT enrichment_status, COUNT(*) AS n FROM symbols
      WHERE project_id = ? AND kind = ANY(?) AND summary IS NULL
      GROUP BY enrichment_status`,
    [projectId, ENRICHABLE],
  );
  logger.info({ statuses }, '[diag] enrichment_status of still-null symbols');
}
main().then(() => process.exit(0)).catch((e) => { logger.error({ err: e }, 'failed'); process.exit(1); });
