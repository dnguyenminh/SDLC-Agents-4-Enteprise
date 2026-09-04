/**
 * Hono route for POST /api/v1/pega/ingest-rule — Single-rule ingestion with relative extraction.
 * SA4E-156: Per-rule BFS-compatible endpoint returning discovered dependencies.
 * Pattern: Factory — createIngestRuleRoute() follows existing Hono route factory conventions.
 */

import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { Logger } from 'pino';
import type { ModuleRegistry } from '../../modules/ModuleRegistry.js';
import { PegaService } from '../../modules/pega/PegaService.js';
import { IngestRuleRequestSchema } from '../../modules/pega/schemas/ingest-rule.schema.js';
import { RelativeExtractor } from '../../modules/pega/services/RelativeExtractor.js';
import { PegaSchemaLoader } from '../../modules/pega/PegaSchemaLoader.js';
import type { PegaRuleKbSchema } from '../../modules/pega/strategies/KbDrivenPegaParserStrategy.js';

/** Build schemaMap from pega-core-schemas.json (cached singleton) */
let cachedSchemaMap: Map<string, PegaRuleKbSchema> | null = null;

function getSchemaMap(): Map<string, PegaRuleKbSchema> {
  if (!cachedSchemaMap) {
    const schemas = PegaSchemaLoader.loadAllSchemas();
    cachedSchemaMap = new Map(schemas.map((s) => [s.targetClass, s]));
  }
  return cachedSchemaMap;
}

/**
 * Create Hono route for single-rule ingestion + relative extraction.
 * @param registry - Module registry for accessing memory/PegaService
 * @param logger - Pino logger instance
 */
/** Hono env — SA4E-241: jwtAuth injects the authenticated project identity here. */
type PegaEnv = { Variables: { projectContext?: { projectId?: string; userId?: string } } };

export function createIngestRuleRoute(registry: ModuleRegistry, logger: Logger): Hono<PegaEnv> {
  const app = new Hono<PegaEnv>();

  // 10MB body limit per rule JSON
  app.use('*', bodyLimit({ maxSize: 10 * 1024 * 1024 }));

  app.post('/', async (c) => {
    // 1. Resolve PegaService from memory module
    const service = resolvePegaService(registry);
    if (!service) {
      return c.json({
        data: null,
        error: { code: 'NOT_READY', message: 'Memory module not ready' },
      }, 503);
    }

    // SA4E-241 SEC-01: projectId derives from the authenticated identity, never
    // from the body. This is a WRITE path — fail-closed (401) with no identity;
    // body.projectId may only cross-check (403 on mismatch).
    const identityProjectId = c.get('projectContext')?.projectId ?? '';
    if (!identityProjectId) {
      return c.json({ data: null, error: { code: 'MISSING_PROJECT_IDENTITY',
        message: 'X-Project-Id header or JWT pid claim is required.' } }, 401);
    }

    // 2. Parse and validate request body
    const body = await c.req.json().catch(() => null);
    if (!body) {
      return c.json({
        data: null,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' },
      }, 400);
    }

    const parsed = IngestRuleRequestSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message || 'Invalid request';
      return c.json({
        data: null,
        error: { code: 'VALIDATION_ERROR', message: msg },
      }, 400);
    }

    // SA4E-241 SEC-01: body.projectId (if sent) must match identity → 403.
    if (parsed.data.projectId && parsed.data.projectId !== identityProjectId) {
      return c.json({ data: null, error: { code: 'PROJECT_MISMATCH',
        message: 'body.projectId does not match the authenticated identity.' } }, 403);
    }

    // 3. Ingest rule via PegaService — scope strictly by authenticated identity.
    const { ruleJson, checksum, version } = parsed.data;
    const ingestResult = await ingestSafely(service, identityProjectId, ruleJson, checksum, version, logger);
    if (ingestResult.error) {
      return c.json({
        data: null,
        error: { code: 'INTERNAL_ERROR', message: ingestResult.error },
      }, 500);
    }

    // 4. Extract relatives via RelativeExtractor
    const schemaMap = getSchemaMap();
    const extractor = new RelativeExtractor(schemaMap);
    const relatives = extractor.extract(ruleJson as Record<string, unknown>);

    // 5. Return combined response
    const status = ingestResult.ruleId === -1 ? 200 : 201;
    return c.json({
      data: {
        status: ingestResult.status,
        ruleId: ingestResult.ruleId,
        unresolvedDependencies: relatives,
        reason: ingestResult.reason,
      },
      error: null,
    }, status);
  });

  return app;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Lazily resolve PegaService from memory module */
function resolvePegaService(registry: ModuleRegistry): PegaService | null {
  const memModule = registry.getModule('memory') as any;
  if (!memModule || memModule.status !== 'ready') return null;
  return new PegaService(memModule.getEngine());
}

/** Wrap ingestRule in try/catch to prevent unhandled exceptions */
async function ingestSafely(
  service: PegaService,
  projectId: string,
  ruleJson: Record<string, unknown>,
  checksum: string | undefined,
  version: string | undefined,
  logger: Logger,
): Promise<{ status: string; ruleId?: number; reason?: string; error?: string }> {
  try {
    const result = await service.ingestRule({ projectId, ruleJson, checksum, version });
    return { status: result.status, ruleId: result.ruleId, reason: result.reason };
  } catch (err: any) {
    logger.error({ err: err.message, stack: err.stack }, '[pega-ingest-rule] Ingestion failed');
    return { status: 'error', error: 'Ingestion failed. Check server logs for details.' };
  }
}
