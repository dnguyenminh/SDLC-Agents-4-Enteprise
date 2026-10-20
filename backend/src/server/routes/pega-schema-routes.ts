/**
 * SA4E-95 + SA4E-214 — Pega Schema Routes (facade).
 * POST /pega/schema/generate — Backend parses harness JSON + section JSONs → returns JSON Schema.
 * POST /pega/schema/analyze  — Dual-strategy analysis (rule-based + LLM fallback)
 * POST /pega/schema/store    — Persist enriched schema in KB
 * GET  /pega/schema/find     — Retrieve enriched schema by rule type
 * PATCH /pega/schema/update  — Progressive field append
 * R-01: Body size limit enforced (5MB max).
 *
 * Implementation submodules (same directory):
 * - pega-schema-generate-route.ts  — POST /generate (harness parsing + LLM wiring)
 * - pega-schema-enriched-routes.ts — SA4E-214 analyze/store/find/update
 */

import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { Logger } from 'pino';
import { FormatTypeMapper } from '../../modules/pega/harness-schema/generator/FormatTypeMapper.js';
import { SchemaBuilder } from '../../modules/pega/harness-schema/generator/SchemaBuilder.js';
import { PageContextResolver } from '../../modules/pega/harness-schema/resolver/PageContextResolver.js';
import { SchemaAnalyzeService } from '../../modules/pega/schema/SchemaAnalyzeService.js';
import { SchemaStorageService } from '../../modules/pega/schema/SchemaStorageService.js';
import { registerSchemaGenerateRoute } from './pega-schema-generate-route.js';
import { registerEnrichedSchemaRoutes } from './pega-schema-enriched-routes.js';

/**
 * Create schema generation routes.
 * Backend does NOT talk to Pega — extension provides all raw JSON.
 * SA4E-214: Added analyze, store, find, update endpoints for enriched schemas.
 */
export function createPegaSchemaRoutes(logger: Logger, dbAdapter?: any): Hono {
  const app = new Hono();
  const formatMapper = new FormatTypeMapper();
  const schemaBuilder = new SchemaBuilder(formatMapper);
  const contextResolver = new PageContextResolver();

  // R-01: 5MB body size limit on all schema endpoints
  app.use('/*', bodyLimit({ maxSize: 5 * 1024 * 1024 }));

  // Wire up SA4E-214 services (lazy — only if dbAdapter available)
  let analyzeService: SchemaAnalyzeService | null = null;
  let storageService: SchemaStorageService | null = null;

  const ensureServices = () => {
    if (!analyzeService) {
      analyzeService = new SchemaAnalyzeService(logger, null); // LLM wired separately
    }
    if (!storageService && dbAdapter) {
      storageService = new SchemaStorageService(dbAdapter, logger);
    }
  };

  registerSchemaGenerateRoute(app, { logger, schemaBuilder, contextResolver });

  registerEnrichedSchemaRoutes(app, {
    logger,
    getAnalyzeService: () => { ensureServices(); return analyzeService; },
    getStorageService: () => { ensureServices(); return storageService; },
  });

  return app;
}
