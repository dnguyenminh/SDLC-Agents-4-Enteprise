/**
 * SA4E-214 — Enriched Pega schema endpoints (analyze/store/find/update).
 * Extracted from pega-schema-routes.ts; services are created lazily and only
 * when a DB adapter is available (storage) or unconditionally (analyze).
 */

import { Hono } from 'hono';
import type { Logger } from 'pino';
import { SchemaAnalyzeService } from '../../modules/pega/schema/SchemaAnalyzeService.js';
import { SchemaStorageService, SchemaNotFoundError, SchemaAlreadyExistsError } from '../../modules/pega/schema/SchemaStorageService.js';
import { SchemaAnalyzeRequestSchema, SchemaStoreRequestSchema, SchemaUpdateRequestSchema } from '../../models/pega-schema.models.js';

/** Shared deps for the SA4E-214 endpoint registrars. */
interface RouteDeps<T> {
  logger?: Logger;
  ensureServices: () => T | null;
}

/** Register the four SA4E-214 enriched-schema endpoints on the app. */
export function registerEnrichedSchemaRoutes(
  app: Hono,
  services: {
    logger: Logger;
    getAnalyzeService: () => SchemaAnalyzeService | null;
    getStorageService: () => SchemaStorageService | null;
  },
): void {
  registerAnalyzeRoute(app, { logger: services.logger, ensureServices: services.getAnalyzeService });
  registerStoreRoute(app, { logger: services.logger, ensureServices: services.getStorageService });
  registerFindRoute(app, { ensureServices: services.getStorageService });
  registerUpdateRoute(app, { logger: services.logger, ensureServices: services.getStorageService });
}

/**
 * POST /pega/schema/analyze — Dual-strategy analysis (TDD §3.2)
 * Receives harness/section JSON, returns fields + sub-sections.
 */
function registerAnalyzeRoute(
  app: Hono, deps: RouteDeps<SchemaAnalyzeService>,
): void {
  const logger = deps.logger!;
  app.post('/pega/schema/analyze', async (c) => {
    const analyzeService = deps.ensureServices();
    if (!analyzeService) {
      return c.json({ error: 'Analyze service unavailable' }, 503);
    }

    const raw = await c.req.json();
    const parsed = SchemaAnalyzeRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({
        error: 'Invalid request',
        code: 'SCHEMA_INVALID_REQUEST',
        details: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`),
      }, 400);
    }

    try {
      const result = await analyzeService.analyze(
        parsed.data.harnessJson,
        parsed.data.ruleType,
        parsed.data.depth,
      );
      return c.json(result);
    } catch (err: any) {
      if (err.message?.includes('timeout')) {
        return c.json({ error: 'LLM timeout', code: 'SCHEMA_LLM_TIMEOUT' }, 504);
      }
      logger.error({ err: err.message }, '[pega-schema] Analysis failed');
      return c.json({
        error: 'Analysis failed',
        code: 'SCHEMA_ANALYSIS_FAILED',
        ...(process.env.NODE_ENV !== 'production' && { details: err.message }),
      }, 500);
    }
  });
}

/** POST /pega/schema/store — Persist enriched schema (TDD §3.3) */
function registerStoreRoute(
  app: Hono, deps: RouteDeps<SchemaStorageService>,
): void {
  const logger = deps.logger!;
  app.post('/pega/schema/store', async (c) => {
    const storageService = deps.ensureServices();
    if (!storageService) {
      return c.json({ error: 'Storage service unavailable (no DB adapter)' }, 503);
    }

    const raw = await c.req.json();
    const parsed = SchemaStoreRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({
        error: 'Invalid schema',
        code: 'SCHEMA_INVALID_SCHEMA',
        details: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`),
      }, 400);
    }

    try {
      const id = await storageService.store(parsed.data.schema);
      return c.json({ success: true, id }, 201);
    } catch (err: any) {
      if (err instanceof SchemaAlreadyExistsError) {
        return c.json({ error: err.message, code: 'SCHEMA_ALREADY_EXISTS' }, 409);
      }
      logger.error({ err: err.message }, '[pega-schema] Store failed');
      return c.json({
        error: 'Store failed',
        ...(process.env.NODE_ENV !== 'production' && { details: err.message }),
      }, 500);
    }
  });
}

/** GET /pega/schema/find?ruleType=X — Retrieve schema (TDD §3.4) */
function registerFindRoute(app: Hono, deps: RouteDeps<SchemaStorageService>): void {
  app.get('/pega/schema/find', async (c) => {
    const storageService = deps.ensureServices();
    if (!storageService) {
      return c.json({ error: 'Storage service unavailable (no DB adapter)' }, 503);
    }

    const ruleType = c.req.query('ruleType');
    if (!ruleType || ruleType.length === 0) {
      return c.json({ error: 'Missing ruleType query parameter', code: 'SCHEMA_INVALID_REQUEST' }, 400);
    }

    const schema = await storageService.find(ruleType);
    if (!schema) {
      return c.json({ error: 'Schema not found for rule type', ruleType }, 404);
    }
    return c.json(schema);
  });
}

/** PATCH /pega/schema/update — Progressive field append (TDD §3.5) */
function registerUpdateRoute(
  app: Hono, deps: RouteDeps<SchemaStorageService>,
): void {
  const logger = deps.logger!;
  app.patch('/pega/schema/update', async (c) => {
    const storageService = deps.ensureServices();
    if (!storageService) {
      return c.json({ error: 'Storage service unavailable (no DB adapter)' }, 503);
    }

    const raw = await c.req.json();
    const parsed = SchemaUpdateRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({
        error: 'Invalid update request',
        code: 'SCHEMA_EMPTY_UPDATE',
        details: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`),
      }, 400);
    }

    try {
      const newVersion = await storageService.update(parsed.data.ruleType, parsed.data.new_fields);
      return c.json({ success: true, new_version: newVersion });
    } catch (err: any) {
      if (err instanceof SchemaNotFoundError) {
        return c.json({ error: err.message, code: 'SCHEMA_NOT_FOUND' }, 404);
      }
      logger.error({ err: err.message }, '[pega-schema] Update failed');
      return c.json({
        error: 'Update failed',
        ...(process.env.NODE_ENV !== 'production' && { details: err.message }),
      }, 500);
    }
  });
}
