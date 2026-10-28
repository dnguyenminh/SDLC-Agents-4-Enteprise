/**
 * Hono route for POST /api/v1/pega/ingest-rule — Single-rule ingestion with relative extraction.
 * SA4E-156: Per-rule BFS-compatible endpoint returning discovered dependencies.
 * Pattern: Factory — createIngestRuleRoute() follows existing Hono route factory conventions.
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { Logger } from 'pino';
import type { ModuleRegistry } from '../../modules/ModuleRegistry.js';
import { PegaService } from '../../modules/pega/PegaService.js';
import { IngestRuleRequestSchema } from '../../modules/pega/schemas/ingest-rule.schema.js';
import { RelativeExtractor } from '../../modules/pega/services/RelativeExtractor.js';
import { PegaSchemaLoader } from '../../modules/pega/PegaSchemaLoader.js';
import type { PegaRuleKbSchema } from '../../modules/pega/strategies/KbDrivenPegaParserStrategy.js';
import {
  classifyIngestError, classifyExtractionError, type ClassifiedIngestError,
} from '../../modules/pega/ingest-error-classifier.js';

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
    // Top-level guard: ingestSafely only wraps service.ingestRule(). Steps 4-5
    // (getSchemaMap + RelativeExtractor.extract) run OUTSIDE it — a throw there
    // would escape the handler and, under the Node HTTP server, can surface on the
    // client as a socket close with no response (UND_ERR_SOCKET) instead of a 500.
    // Wrapping the whole handler guarantees EVERY failure returns an error envelope.
    try {
      return await handleIngest(c, registry, logger);
    } catch (err) {
      const classified = classifyIngestError(err);
      logger.error({ err: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined, code: classified.code },
        '[pega-ingest-rule] Unhandled error in route handler');
      const httpStatus = classified.details.retryable ? 503 : 500;
      return c.json({ data: null, error: classified }, httpStatus);
    }
  });

  return app;
}

/**
 * Core ingest handler — parse, validate, ingest, extract relatives.
 * Extracted so the route wrapper can catch ANY throw (including the post-ingest
 * schema/extraction steps) and always return an envelope.
 */
async function handleIngest(
  c: Context<PegaEnv>,
  registry: ModuleRegistry,
  logger: Logger,
) {
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
    if (ingestResult.classified) {
      // Classified, log-free envelope: the extension reads code + details.category
      // + details.retryable to decide retry-vs-skip and show the user a cause.
      // Transient faults → 503 (retry-after semantics); permanent → 500.
      const httpStatus = ingestResult.classified.details.retryable ? 503 : 500;
      return c.json({ data: null, error: ingestResult.classified }, httpStatus);
    }

    // 4. Extract relatives via RelativeExtractor. This runs AFTER a successful
    // ingest, so a failure here must NOT masquerade as an ingest failure — the
    // rule IS stored. Return a distinct EXTRACTION_ERROR so the extension knows
    // the rule landed but relatives are unknown (do not re-ingest blindly).
    let relatives;
    try {
      const schemaMap = getSchemaMap();
      const extractor = new RelativeExtractor(schemaMap);
      relatives = extractor.extract(ruleJson as Record<string, unknown>);
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined, ruleId: ingestResult.ruleId },
        '[pega-ingest-rule] Relative extraction failed (rule already stored)');
      return c.json({ data: null, error: classifyExtractionError(err) }, 500);
    }

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
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Lazily resolve PegaService from memory module */
function resolvePegaService(registry: ModuleRegistry): PegaService | null {
  const memModule = registry.getModule('memory') as any;
  if (!memModule || memModule.status !== 'ready') return null;
  return new PegaService(memModule.getEngine());
}

/**
 * Wrap ingestRule in try/catch. On failure, return a CLASSIFIED error (safe,
 * log-free) so the route can hand the extension a structured cause — the raw
 * message/stack stays in the server log only (SEC: no internal detail leak).
 */
async function ingestSafely(
  service: PegaService,
  projectId: string,
  ruleJson: Record<string, unknown>,
  checksum: string | undefined,
  version: string | undefined,
  logger: Logger,
): Promise<{ status: string; ruleId?: number; reason?: string; classified?: ClassifiedIngestError }> {
  try {
    const result = await service.ingestRule({ projectId, ruleJson, checksum, version });
    return { status: result.status, ruleId: result.ruleId, reason: result.reason };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    const classified = classifyIngestError(err);
    // Full detail in the log (for ops); only the classified envelope on the wire.
    logger.error({ err: message, stack, code: classified.code, category: classified.details.category },
      '[pega-ingest-rule] Ingestion failed');
    return { status: 'error', classified };
  }
}
