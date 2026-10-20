/**
 * Pega crawl/discovery routes — discover, browser-plan, crawl-plan, crawl-batch.
 * Extracted from pega-api.ts (BR-18).
 */
import type { Hono } from 'hono';
import type {
  PegaCrawlPlanRequest,
  PegaCrawlBatchRequest,
  PegaCrawlKey,
} from '../../modules/pega/models.js';
import { PegaActionPlanGenerator } from '../../modules/pega/PegaActionPlanGenerator.js';
import { PegaCrawler } from '../../modules/pega/PegaCrawler.js';
import type { PegaEnv, PegaRouteContext } from './pega-routes-context.js';

export function registerPegaCrawlRoutes(app: Hono<PegaEnv>, ctx: PegaRouteContext): void {
  const { logger, getPegaService } = ctx;

  /**
   * SA4E-230: Discover a Pega app's service surface via the custom
   * CodeIntelligence data-page API (Access Groups -> Service Packages ->
   * Service Methods -> linked Activities) and index discovered rules.
   * The extension "Index Source Code" command calls this for Pega workspaces.
   */
  app.post('/pega/discover', async (c) => {
    const service = getPegaService();
    if (!service) return c.json({ error: { code: 'NOT_READY', message: 'Memory module not ready' } }, 503);
    try {
      const body = await c.req.json<{
        projectId?: string; appName?: string; appVersion?: string;
        codeIntelBase?: string; authHeader?: string; index?: boolean; accessGroup?: string;
      }>();
      const endpoint = process.env.PEGA_ENDPOINT || 'https://cjpge4gy.pegacea.net/prweb';
      const codeIntelBase = body.codeIntelBase
        || process.env.PEGA_CODEINTEL_URL
        || `${endpoint}/api/CodeIntelligence/v1`;
      const authHeader = body.authHeader || process.env.PEGA_AUTH;
      if (!authHeader) {
        return c.json({ data: null, error: { code: 'MISSING_AUTH', message: 'authHeader or PEGA_AUTH required' } }, 400);
      }
      // SA4E-241 SEC-01: projectId derives from the authenticated identity, never
      // from the body. Fail-closed (401) when no identity is present; body.projectId
      // may only be used to cross-check identity (403 on mismatch).
      const identityProjectId = c.get('projectContext')?.projectId ?? '';
      if (!identityProjectId) {
        return c.json({ data: null, error: { code: 'MISSING_PROJECT_IDENTITY',
          message: 'X-Project-Id header or JWT pid claim is required.' } }, 401);
      }
      if (body.projectId && body.projectId !== identityProjectId) {
        return c.json({ data: null, error: { code: 'PROJECT_MISMATCH',
          message: 'body.projectId does not match the authenticated identity.' } }, 403);
      }
      const report = await service.discoverServices({
        codeIntelBase,
        authHeader,
        appName: body.appName || process.env.PEGA_APP_NAME || 'HRAppsV2',
        appVersion: body.appVersion || process.env.PEGA_APP_VERSION || '01.01',
        projectId: identityProjectId,
        index: body.index ?? true,
        accessGroup: body.accessGroup,
      });
      return c.json({ data: report, error: null });
    } catch (err: any) {
      logger.error({ err }, 'pega/discover failed');
      return c.json({ data: null, error: { code: 'INTERNAL_ERROR', message: err.message } }, 500);
    }
  });

  app.post('/pega/browser-plan', async (c) => {
    try {
      const body = await c.req.json<{ ruleJson: Record<string, unknown> }>();
      const plan = PegaActionPlanGenerator.generatePlan(body.ruleJson);
      return c.json({ data: plan, error: null });
    } catch (err: any) {
      logger.error({ err }, 'pega/browser-plan failed');
      return c.json({ data: null, error: { code: 'INTERNAL_ERROR', message: err.message } }, 500);
    }
  });

  app.post('/pega/crawl-plan', async (c) => {
    const service = getPegaService();
    if (!service) return c.json({ error: { code: 'NOT_READY', message: 'Memory module not ready' } }, 503);
    try {
      const body = await c.req.json<PegaCrawlPlanRequest>();
      const crawler = new PegaCrawler();
      const visitedKeys = new Set(body.visitedKeys || []);
      const plan = crawler.plan(body.ruleKeys, visitedKeys);
      const adapter = (service as any).memoryEngine.getAdapter();
      const ruleChecksums = body.ruleChecksums || {};
      const stillMissing: PegaCrawlKey[] = [];
      const cachedFromDb: string[] = [...plan.cached];
      for (const key of plan.missing) {
        const fqn = `${key.pxObjClass}:${key.pyClassName}:${key.pyRuleName}`;
        const row = await adapter.getAsync(
          `SELECT f.content_hash
           FROM symbols s JOIN files f ON f.id = s.file_id
           WHERE s.project_id = $1 AND s.signature = $2 AND s.kind LIKE 'pega_%'
           LIMIT 1`,
          [body.projectId, fqn],
        ) as { content_hash?: string } | undefined;
        if (row) {
          const extChecksum = ruleChecksums[key.insKey];
          if (extChecksum) {
            if (row.content_hash === extChecksum) {
              cachedFromDb.push(key.insKey);
              continue;
            }
          } else {
            cachedFromDb.push(key.insKey);
            continue;
          }
        }
        stillMissing.push(key);
      }
      return c.json({ data: { missing: stillMissing, cached: cachedFromDb }, error: null });
    } catch (err: any) {
      logger.error({ err }, 'pega/crawl-plan failed');
      return c.json({ data: null, error: { code: 'INTERNAL_ERROR', message: err.message } }, 500);
    }
  });

  app.post('/pega/crawl-batch', async (c) => {
    const service = getPegaService();
    if (!service) return c.json({ error: { code: 'NOT_READY', message: 'Memory module not ready' } }, 503);
    try {
      const body = await c.req.json<PegaCrawlBatchRequest>();
      const crawler = new PegaCrawler();
      const visitedKeys = new Set(body.visitedKeys || []);

      const rulesChecksums = body.rulesChecksums || {};
      const rulesVersions = body.rulesVersions || {};
      let stored = 0;
      for (const rule of body.rules) {
        try {
          const sym = service.parseRuleToSymbol(rule);
          const chk = sym ? rulesChecksums[sym.fqn] : undefined;
          const ver = sym ? rulesVersions[sym.fqn] : undefined;
          const result = await service.ingestRule({
            projectId: body.projectId,
            ruleJson: rule,
            checksum: chk,
            version: ver,
          });
          if (result.status === 'success' && result.ruleId !== -1 && result.ruleId !== undefined) stored++;
        } catch (err) { logger.debug({ err }, '[pega] Single rule ingest failed in batch — skipping'); }
      }

      let totalRulesInDb = stored;
      let totalKbEntriesInDb = stored;
      let totalGraphNodesInDb = stored;
      try {
        const adapter = (service as any).memoryEngine.getAdapter();
        const rowRules = (await adapter.getAsync(
          "SELECT COUNT(*) as cnt FROM symbols WHERE project_id = $1 AND kind LIKE 'pega_%'",
          [body.projectId]
        )) as { cnt?: number } | undefined;
        if (rowRules && typeof rowRules.cnt === 'number') { totalRulesInDb = Number(rowRules.cnt); }

        const rowKb = (await adapter.getAsync(
          "SELECT COUNT(*) as cnt FROM symbols WHERE project_id = $1",
          [body.projectId]
        )) as { cnt?: number } | undefined;
        if (rowKb && typeof rowKb.cnt === 'number') { totalKbEntriesInDb = Number(rowKb.cnt); }

        const rowGraph = (await adapter.getAsync(
          "SELECT COUNT(*) as cnt FROM graph_nodes WHERE project_id = $1",
          [body.projectId]
        )) as { cnt?: number } | undefined;
        if (rowGraph && typeof rowGraph.cnt === 'number') { totalGraphNodesInDb = Number(rowGraph.cnt); }
      } catch (err) { logger.debug({ err }, '[pega] Failed to query DB totals (using fallback values)'); }

      try {
        const adapter = (service as any).memoryEngine.getAdapter();
        const eng = adapter.getEngine();
        const ts = eng === 'sqlite' ? `datetime('now')` : 'current_timestamp';
        await adapter.runAsync(
          `INSERT INTO project_registry (project_id, display_name, workspace_path, created_by, last_seen)
           VALUES ($1, $2, $3, $4, ${ts})
           ON CONFLICT (project_id) DO UPDATE SET last_seen = ${ts}`,
          [body.projectId, 'Pega: ' + ((body.rules[0] as any)?.pyApplication || body.projectId), '', 'pega-crawler'],
        );
      } catch (err) { logger.debug({ err }, '[pega] Failed to register project in project_registry (non-fatal)'); }

      // Compute next batch: find class dependencies (pyClassName, pyDerivesFrom, pySuperClass)
      // that haven't been ingested yet — extension will fetch them from Pega
      const nextBatch = crawler.computeNextBatch(body.rules, visitedKeys, body.projectId);
      return c.json({ data: { stored, totalRulesInDb, totalKbEntriesInDb, totalGraphNodesInDb, nextBatch }, error: null });
    } catch (err: any) {
      logger.error({ err }, 'pega/crawl-batch failed');
      return c.json({ data: null, error: { code: 'INTERNAL_ERROR', message: err.message } }, 500);
    }
  });
}
