/**
 * Pega core CRUD routes — check-rule, ingest-rule, schemas, ast-parse, ast-prompt.
 * Extracted from pega-api.ts (BR-18).
 */
import type { Hono } from 'hono';
import type {
  PegaCheckRuleRequest,
  PegaIngestRuleRequest,
} from '../../modules/pega/models.js';
import type { PegaRuleKbSchema } from '../../modules/pega/strategies/KbDrivenPegaParserStrategy.js';
import { MissingChecksumError } from '../../modules/pega/PegaSymbolSync.js';
import type { PegaEnv, PegaRouteContext } from './pega-routes-context.js';

export function registerPegaCoreRoutes(app: Hono<PegaEnv>, ctx: PegaRouteContext): void {
  const { logger, getPegaService } = ctx;

  app.post('/pega/check-rule', async (c) => {
    const service = getPegaService();
    if (!service) return c.json({ error: { code: 'NOT_READY', message: 'Memory module not ready' } }, 503);
    try {
      const body = await c.req.json<PegaCheckRuleRequest>();
      return c.json({ data: await service.checkRule(body), error: null });
    } catch (err: any) {
      logger.error({ err }, 'pega/check-rule failed');
      return c.json({ data: null, error: { code: 'INTERNAL_ERROR', message: err.message } }, 500);
    }
  });

  // SA4E-241 SEC-01: identity-bound ingest-rule (WRITE path). projectId derives
  // from the authenticated identity, never from the body (fail-closed 401; 403 on
  // mismatch). The required client checksum is validated inside service.ingestRule
  // → syncRuleToSymbols (NT-4 — backend never computes it).
  app.post('/pega/ingest-rule', async (c) => {
    const service = getPegaService();
    if (!service) return c.json({ data: null, error: { code: 'NOT_READY', message: 'Memory module not ready' } }, 503);
    const identityProjectId = c.get('projectContext')?.projectId ?? '';
    if (!identityProjectId) {
      return c.json({ data: null, error: { code: 'MISSING_PROJECT_IDENTITY',
        message: 'X-Project-Id header or JWT pid claim is required.' } }, 401);
    }
    try {
      const body = await c.req.json<PegaIngestRuleRequest>();
      if (body.projectId && body.projectId !== identityProjectId) {
        return c.json({ data: null, error: { code: 'PROJECT_MISMATCH',
          message: 'body.projectId does not match the authenticated identity.' } }, 403);
      }
      // Scope strictly by identity (override any body.projectId).
      const result = await service.ingestRule({ ...body, projectId: identityProjectId });
      return c.json({ data: result, error: null }, 201);
    } catch (err: any) {
      if (err instanceof MissingChecksumError) {
        return c.json({ data: null, error: { code: err.code, message: err.message } }, 400);
      }
      logger.error({ err }, 'pega/ingest-rule failed');
      return c.json({ data: null, error: { code: 'INTERNAL_ERROR', message: err.message } }, 500);
    }
  });

  app.get('/pega/schemas', async (c) => {
    const service = getPegaService();
    if (!service) return c.json({ error: { code: 'NOT_READY', message: 'Memory module not ready' } }, 503);
    return c.json({ data: await service.getSchemasFromDb(), error: null });
  });

  app.post('/pega/schemas', async (c) => {
    const service = getPegaService();
    if (!service) return c.json({ error: { code: 'NOT_READY', message: 'Memory module not ready' } }, 503);
    try {
      const schema = await c.req.json<PegaRuleKbSchema>();
      await service.upsertSchemaInDb(schema);
      return c.json({ data: { success: true, targetClass: schema.targetClass }, error: null }, 201);
    } catch (err: any) {
      logger.error({ err }, 'pega/schemas upsert failed');
      return c.json({ data: null, error: { code: 'INTERNAL_ERROR', message: err.message } }, 500);
    }
  });

  app.post('/pega/ast-parse', async (c) => {
    try {
      const body = await c.req.json<{ ruleJson: Record<string, unknown> }>();
      const service = getPegaService();
      if (!service) return c.json({ error: { code: 'NOT_READY', message: 'Memory module not ready' } }, 503);
      const ast = service.parseRuleToAst(body.ruleJson);
      return c.json({ data: ast, error: null });
    } catch (err: any) {
      logger.error({ err }, 'pega/ast-parse failed');
      return c.json({ data: null, error: { code: 'INTERNAL_ERROR', message: err.message } }, 500);
    }
  });

  app.post('/pega/ast-prompt', async (c) => {
    try {
      const body = await c.req.json<{ ruleJson: Record<string, unknown> }>();
      const service = getPegaService();
      if (!service) return c.json({ error: { code: 'NOT_READY', message: 'Memory module not ready' } }, 503);
      const ctx2 = service.ruleToPromptContext(body.ruleJson);
      return c.json({ data: { context: ctx2 }, error: null });
    } catch (err: any) {
      logger.error({ err }, 'pega/ast-prompt failed');
      return c.json({ data: null, error: { code: 'INTERNAL_ERROR', message: err.message } }, 500);
    }
  });
}
