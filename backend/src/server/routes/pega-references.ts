/**
 * SA4E-237 (GD5) — POST /api/v1/pega/references
 * Query the Pega reference-resolution results for a project:
 *   - mode 'from'        : what does symbol X reference?
 *   - mode 'dependents'  : who depends on symbol Y?
 *   - mode 'status'      : all references with a given resolution_status (unresolved/ambiguous/...)
 *
 * Read-only. Returns the standard { data, error } envelope with an explanatory message so the
 * frontend can render UX for empty results (per backend UX rules).
 */
import { Hono } from 'hono';
import type { Logger } from 'pino';
import type { ModuleRegistry } from '../../modules/ModuleRegistry.js';
import { PegaService } from '../../modules/pega/PegaService.js';
import { PegaResolutionStore, type ResolutionRow } from '../../modules/pega/storage/PegaResolutionStore.js';

/** Request body for the references query. */
interface ReferencesQuery {
  projectId: string;
  mode: 'from' | 'dependents' | 'status';
  symbolId?: number;
  status?: ResolutionRow['resolutionStatus'];
}

/**
 * Create the Pega reference-resolution query route.
 * @param registry Module registry (for the memory module / PegaService)
 * @param logger Pino logger
 */
export function createPegaReferenceRoutes(registry: ModuleRegistry, logger: Logger): Hono {
  const app = new Hono();

  const resolveStore = (): PegaResolutionStore | null => {
    const memModule = registry.getModule('memory') as any;
    if (!memModule || memModule.status !== 'ready') return null;
    const service = new PegaService(memModule.getEngine());
    return new PegaResolutionStore(service.getMemoryEngine().getAdapter());
  };

  app.post('/pega/references', async (c) => {
    const store = resolveStore();
    if (!store) {
      return c.json({ data: null, error: { code: 'NOT_READY', message: 'Memory module not ready' } }, 503);
    }
    try {
      const body = await c.req.json<ReferencesQuery>();
      const validationError = validate(body);
      if (validationError) {
        return c.json({ data: null, error: { code: 'INVALID_INPUT', message: validationError } }, 400);
      }

      const rows = await runQuery(store, body);
      const message = rows.length === 0
        ? explainEmpty(body)
        : `${rows.length} reference(s) found for mode '${body.mode}'.`;
      return c.json({ data: { references: rows, message }, error: null });
    } catch (err: any) {
      logger.error({ err }, '[pega-references] query failed');
      return c.json({ data: null, error: { code: 'INTERNAL_ERROR', message: err.message } }, 500);
    }
  });

  return app;
}

/** Validate the query body; returns an error message or null when valid. */
function validate(body: ReferencesQuery): string | null {
  if (!body.projectId) return 'projectId is required';
  if (!body.mode) return "mode is required ('from' | 'dependents' | 'status')";
  if ((body.mode === 'from' || body.mode === 'dependents') && typeof body.symbolId !== 'number') {
    return `symbolId (number) is required for mode '${body.mode}'`;
  }
  if (body.mode === 'status' && !body.status) {
    return "status is required for mode 'status'";
  }
  return null;
}

/** Dispatch the query to the appropriate store method. */
function runQuery(store: PegaResolutionStore, body: ReferencesQuery): Promise<ResolutionRow[]> {
  switch (body.mode) {
    case 'from': return store.referencesFrom(body.projectId, body.symbolId!);
    case 'dependents': return store.dependentsOf(body.projectId, body.symbolId!);
    case 'status': return store.byStatus(body.projectId, body.status!);
  }
}

/** Explain an empty result so the frontend can show useful UX. */
function explainEmpty(body: ReferencesQuery): string {
  if (body.mode === 'from') return `Symbol ${body.symbolId} references no other rules (or is not indexed).`;
  if (body.mode === 'dependents') return `No indexed rule depends on symbol ${body.symbolId}.`;
  return `No references with status '${body.status}'. Ensure the resolution pass has run (sync-to-kb).`;
}
