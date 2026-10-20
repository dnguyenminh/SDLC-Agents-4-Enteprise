/**
 * Pega tooling routes — bulk-check, detect-project, clear-project, fetch-rule.
 * Extracted from pega-api.ts (BR-18).
 */
import type { Hono } from 'hono';
import type { PegaDetectProjectRequest } from '../../modules/pega/models.js';
import { PegaProjectDetector } from '../../modules/pega/PegaProjectDetector.js';
import { BulkCheckRequestSchema } from '../../modules/pega/pegaBulkCheckSchema.js';
import type { PegaEnv, PegaRouteContext } from './pega-routes-context.js';

export function registerPegaToolRoutes(app: Hono<PegaEnv>, ctx: PegaRouteContext): void {
  const { logger, getPegaService, getChecksumStore } = ctx;

  /**
   * SA4E-241 — POST /pega/rulecatalog/bulk-check (NT-4, primary delta endpoint).
   * Receives a set of client-computed checksums, returns the subset that already
   * exists in the authenticated project (`existing`). Backend NEVER computes a
   * checksum — it only stores/compares via ChecksumStore.
   *
   * Client derives: skip = existing; fetch = checksums − existing.
   * Security: identity-bound projectId (SEC-01), strict zod validation (SEC-04),
   * cross-tenant isolation (SEC-10 — scope is identity only).
   */
  app.post('/pega/rulecatalog/bulk-check', async (c) => {
    const service = getPegaService();
    if (!service) return c.json({ data: null, error: { code: 'NOT_READY', message: 'Memory module not ready' } }, 503);

    // SEC-01: single source of truth for projectId = authenticated identity.
    const identityProjectId = c.get('projectContext')?.projectId ?? '';
    if (!identityProjectId) {
      return c.json({ data: null, error: { code: 'MISSING_PROJECT_IDENTITY',
        message: 'X-Project-Id header or JWT pid claim is required.' } }, 401);
    }

    // SEC-04: strict validation of external input via safeParse → 400 on failure.
    let parsed;
    try {
      parsed = BulkCheckRequestSchema.safeParse(await c.req.json());
    } catch (err: any) {
      return c.json({ data: null, error: { code: 'VALIDATION_FAILED',
        message: `Malformed JSON body: ${err.message}` } }, 400);
    }
    if (!parsed.success) {
      return c.json({ data: null, error: { code: 'VALIDATION_FAILED',
        message: parsed.error.message } }, 400);
    }

    // SEC-01: body.projectId (if sent) must match identity → 403 on mismatch.
    if (parsed.data.projectId && parsed.data.projectId !== identityProjectId) {
      return c.json({ data: null, error: { code: 'PROJECT_MISMATCH',
        message: 'body.projectId does not match the authenticated identity.' } }, 403);
    }

    try {
      // NT-4: scope strictly by authenticated identity (never body.projectId).
      const existing = await getChecksumStore(service).findExisting(identityProjectId, parsed.data.checksums);
      // SEC-09: log lengths, not the checksum arrays themselves.
      logger.debug({ projectId: identityProjectId, requested: parsed.data.checksums.length, existing: existing.length },
        'pega/rulecatalog/bulk-check');
      return c.json({ data: { existing }, error: null });
    } catch (err: any) {
      logger.error({ err }, 'pega/rulecatalog/bulk-check failed');
      return c.json({ data: null, error: { code: 'BULK_CHECK_FAILED', message: err.message } }, 500);
    }
  });

  app.post('/pega/detect-project', async (c) => {
    try {
      const body = await c.req.json<PegaDetectProjectRequest>();
      const info = PegaProjectDetector.detect(body.workspaceRoot);
      return c.json({ data: info, error: null });
    } catch (err: any) {
      logger.error({ err }, 'pega/detect-project failed');
      return c.json({ data: null, error: { code: 'INTERNAL_ERROR', message: err.message } }, 500);
    }
  });

  app.post('/pega/clear-project', async (c) => {
    const service = getPegaService();
    if (!service) return c.json({ error: { code: 'NOT_READY', message: 'Memory module not ready' } }, 503);
    try {
      const body = await c.req.json<{ projectId?: string }>();
      // SA4E-241 SEC-01/SEC-02: mutation scope = authenticated identity ONLY.
      // Fail-closed on missing identity; 403 on body/identity mismatch; and NO
      // hard-coded cross-tenant fallback clause on the default project.
      const pid = c.get('projectContext')?.projectId ?? '';
      if (!pid) {
        return c.json({ data: null, error: { code: 'MISSING_PROJECT_IDENTITY',
          message: 'X-Project-Id header or JWT pid claim is required.' } }, 401);
      }
      if (body.projectId && body.projectId !== pid) {
        return c.json({ data: null, error: { code: 'PROJECT_MISMATCH',
          message: 'body.projectId does not match the authenticated identity.' } }, 403);
      }
      const adapter = (service as any).memoryEngine.getAdapter();
      await adapter.runAsync('DELETE FROM knowledge_entries WHERE project_id = $1', [pid]);
      // SA4E-171: rules live in symbols — clear Pega virtual files + symbols
      await adapter.runAsync("DELETE FROM symbols WHERE project_id = $1 AND kind LIKE 'pega_%'", [pid]);
      await adapter.runAsync("DELETE FROM files WHERE project_id = $1 AND language = 'pega'", [pid]);
      await adapter.runAsync('DELETE FROM graph_nodes WHERE project_id = $1', [pid]);
      return c.json({ data: { success: true, clearedProjectId: pid }, error: null });
    } catch (err: any) {
      logger.error({ err }, 'pega/clear-project failed');
      return c.json({ data: null, error: { code: 'INTERNAL_ERROR', message: err.message } }, 500);
    }
  });

  app.post('/pega/fetch-rule', async (c) => {
    try {
      const body = await c.req.json<{
        pxObjClass: string;
        pyRuleName: string;
        insKey?: string;
        pegaEndpoint?: string;
        authHeader?: string;
        username?: string;
        password?: string;
      }>();

      // SA4E-241 SEC-03: NO default credentials. Credentials must come from the
      // per-request authHeader (extension SecretStorage) or explicit username/
      // password in the body — fail-closed (MISSING_AUTH) when none is present.
      const hasBasic = Boolean(body.username && body.password);
      if (!body.authHeader && !hasBasic) {
        return c.json({ data: null, error: { code: 'MISSING_AUTH',
          message: 'authHeader (or username+password) is required — no default credentials.' } }, 400);
      }
      const pegaEndpoint = body.pegaEndpoint || process.env.PEGA_ENDPOINT;
      if (!pegaEndpoint) {
        return c.json({ data: null, error: { code: 'MISSING_ENDPOINT',
          message: 'pegaEndpoint (or PEGA_ENDPOINT env) is required.' } }, 400);
      }

      const { PegaRuleFetcherService } = await import('../../modules/pega/PegaRuleFetcherService.js');
      const fetcher = new PegaRuleFetcherService();
      const res = await fetcher.fetchRule({
        pxObjClass: body.pxObjClass,
        pyRuleName: body.pyRuleName,
        insKey: body.insKey,
        pegaEndpoint,
        authHeader: body.authHeader,
        username: body.username,
        password: body.password,
      });

      return c.json({ data: res, error: null });
    } catch (err: any) {
      logger.error({ err }, 'pega/fetch-rule failed');
      return c.json({ data: null, error: { code: 'INTERNAL_ERROR', message: err.message } }, 500);
    }
  });
}
