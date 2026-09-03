/**
 * Pega API Routes — Check rule, Ingest rule, Get schemas, Upsert schema, Browser plan, Crawl, Project detect.
 */

import { Hono } from 'hono';
import type { Logger } from 'pino';
import type { ModuleRegistry } from '../../modules/ModuleRegistry.js';
import type {
  PegaCheckRuleRequest,
  PegaIngestRuleRequest,
  PegaCrawlPlanRequest,
  PegaCrawlBatchRequest,
  PegaCrawlKey,
  PegaDetectProjectRequest,
} from '../../modules/pega/models.js';
import { PegaService } from '../../modules/pega/PegaService.js';
import { PegaActionPlanGenerator } from '../../modules/pega/PegaActionPlanGenerator.js';
import { PegaCrawler } from '../../modules/pega/PegaCrawler.js';
import { PegaProjectDetector } from '../../modules/pega/PegaProjectDetector.js';
import type { PegaRuleKbSchema } from '../../modules/pega/strategies/KbDrivenPegaParserStrategy.js';
import { PegaExpressionEvaluator } from '../../modules/pega/expression/PegaExpressionEvaluator.js';
import { PegaClipboardContext } from '../../modules/pega/expression/PegaClipboardContext.js';
import { PegaWhenEvaluator } from '../../modules/pega/expression/PegaWhenEvaluator.js';
import { PegaConstraintEvaluator } from '../../modules/pega/expression/PegaConstraintEvaluator.js';
import { PegaFlowGraphBuilder } from '../../modules/pega/workflow/PegaFlowGraphBuilder.js';
import { PegaWorkflowEngine } from '../../modules/pega/workflow/PegaWorkflowEngine.js';
import { PegaEvaluationSandbox } from '../../modules/pega/security/PegaEvaluationSandbox.js';
import { ExprNodeValidator } from '../../modules/pega/expression/ExprNodeValidator.js';
import { parseExpression } from '../../modules/pega/expression/pega-expr/parser.js';
import { PegaEvaluationCache } from '../../modules/pega/deploy/PegaEvaluationCache.js';
import { PegaDecisionTableEvaluator } from '../../modules/pega/decision/PegaDecisionTableEvaluator.js';
import { PegaDecisionTreeEvaluator } from '../../modules/pega/decision/PegaDecisionTreeEvaluator.js';
import { PegaSectionRenderer } from '../../modules/pega/ui/PegaSectionRenderer.js';
import { PegaHarnessAssembler } from '../../modules/pega/ui/PegaHarnessAssembler.js';
import type { PegaDecisionTableRow, DecisionTreeNode } from '../../modules/pega/decision/PegaEvaluationResult.js';
import type { PegaSection } from '../../modules/pega/ui/PegaUITypes.js';
import { ChecksumStore } from '../../modules/pega/ChecksumStore.js';
import { BulkCheckRequestSchema } from '../../modules/pega/pegaBulkCheckSchema.js';

/** Hono env — SA4E-241: jwtAuth injects the authenticated project identity here. */
type PegaEnv = { Variables: { projectContext?: { projectId?: string; userId?: string } } };

export function createPegaApiRoutes(registry: ModuleRegistry, logger: Logger): Hono<PegaEnv> {
  const app = new Hono<PegaEnv>();

  let pegaService: PegaService | null = null;
  const getPegaService = (): PegaService | null => {
    const memModule = registry.getModule('memory') as any;
    if (!memModule || memModule.status !== 'ready') return null;
    if (!pegaService) pegaService = new PegaService(memModule.getEngine());
    return pegaService;
  };

  /** SA4E-241: ChecksumStore over the SAME adapter PegaService uses (single DB). */
  const getChecksumStore = (service: PegaService): ChecksumStore =>
    new ChecksumStore((service as any).memoryEngine.getAdapter());

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

  app.post('/pega/ingest-rule', async (c) => {
    const service = getPegaService();
    if (!service) return c.json({ error: { code: 'NOT_READY', message: 'Memory module not ready' } }, 503);
    try {
      const body = await c.req.json<PegaIngestRuleRequest>();
      return c.json({ data: await service.ingestRule(body), error: null }, 201);
    } catch (err: any) {
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
      const ctx = service.ruleToPromptContext(body.ruleJson);
      return c.json({ data: { context: ctx }, error: null });
    } catch (err: any) {
      logger.error({ err }, 'pega/ast-prompt failed');
      return c.json({ data: null, error: { code: 'INTERNAL_ERROR', message: err.message } }, 500);
    }
  });

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

  // L3-L4 endpoints

  const evalCache = new PegaEvaluationCache();

  app.post('/pega/evaluate-expression', async (c) => {
    try {
      const body = await c.req.json<{
        expression: string;
        clipboard?: Record<string, Record<string, unknown>>;
        currentPage?: string;
        timeout?: number;
      }>();

      const validator = new ExprNodeValidator();
      const validation = validator.validate(parseExpression(body.expression));
      if (!validation.valid) {
        return c.json({ data: null, error: { code: validation.errors[0].code, message: validation.errors[0].message } }, 400);
      }

      const cacheKey = `${body.expression}:${JSON.stringify(body.clipboard || {})}`;
      const cached = evalCache.get(cacheKey);
      if (cached) return c.json({ data: cached, error: null });

      const sandbox = new PegaEvaluationSandbox({ timeoutMs: body.timeout ?? 5000 });
      const result = await sandbox.evaluate({
        expression: body.expression,
        clipboard: body.clipboard || {},
        currentPage: body.currentPage,
      });

      evalCache.set(cacheKey, result);
      return c.json({ data: result, error: null });
    } catch (err: any) {
      logger.error({ err }, 'pega/evaluate-expression failed');
      const status = err.code === 'PARSE_ERROR' || err.code === 'PROPERTY_NOT_FOUND' || err.code === 'FUNCTION_NOT_ALLOWED' ? 400 : 500;
      return c.json({ data: null, error: { code: err.code || 'INTERNAL_ERROR', message: err.message } }, status);
    }
  });

  app.post('/pega/evaluate-when', async (c) => {
    try {
      const body = await c.req.json<{
        expression: string;
        clipboard?: Record<string, Record<string, unknown>>;
        currentPage?: string;
      }>();

      const ctx = new PegaClipboardContext(body.clipboard || {}, body.currentPage);
      const whenEval = new PegaWhenEvaluator();
      const result = whenEval.evaluateWhen(body.expression, ctx);

      return c.json({ data: result, error: null });
    } catch (err: any) {
      logger.error({ err }, 'pega/evaluate-when failed');
      return c.json({ data: null, error: { code: 'INTERNAL_ERROR', message: err.message } }, 500);
    }
  });

  app.post('/pega/evaluate-constraints', async (c) => {
    try {
      const body = await c.req.json<{
        constraints: Array<{ targetProperty: string; expression: string; label?: string; enabled?: boolean }>;
        clipboard?: Record<string, Record<string, unknown>>;
        currentPage?: string;
      }>();

      const ctx = new PegaClipboardContext(body.clipboard || {}, body.currentPage);
      const constraintEval = new PegaConstraintEvaluator();
      const result = constraintEval.evaluateConstraints(body.constraints, ctx);

      return c.json({ data: result, error: null });
    } catch (err: any) {
      logger.error({ err }, 'pega/evaluate-constraints failed');
      return c.json({ data: null, error: { code: 'INTERNAL_ERROR', message: err.message } }, 500);
    }
  });

  app.post('/pega/simulate-flow', async (c) => {
    try {
      const body = await c.req.json<{
        flowJson: { pyShapes?: Record<string, unknown>[]; shapes?: Record<string, unknown>[]; pyConnectors?: Record<string, unknown>[]; connectors?: Record<string, unknown>[] };
        initialClipboard?: Record<string, Record<string, unknown>>;
        startShapeId?: string;
      }>();

      const shapes = body.flowJson.pyShapes || body.flowJson.shapes || [];
      const connectors = body.flowJson.pyConnectors || body.flowJson.connectors || [];

      const builder = new PegaFlowGraphBuilder();
      const graph = builder.build(shapes, connectors);

      const ctx = new PegaClipboardContext(body.initialClipboard || {});

      const engine = new PegaWorkflowEngine();
      const result = engine.simulate(graph, ctx, body.startShapeId);

      return c.json({ data: result, error: null });
    } catch (err: any) {
      logger.error({ err }, 'pega/simulate-flow failed');
      return c.json({ data: null, error: { code: 'INTERNAL_ERROR', message: err.message } }, 500);
    }
  });

  app.post('/pega/evaluate-decision-table', async (c) => {
    try {
      const body = await c.req.json<{
        rows: PegaDecisionTableRow[];
        clipboard?: Record<string, Record<string, unknown>>;
        currentPage?: string;
      }>();
      const ctx = new PegaClipboardContext(body.clipboard || {}, body.currentPage);
      const evaluator = new PegaExpressionEvaluator();
      const tableEval = new PegaDecisionTableEvaluator();
      const result = tableEval.evaluate(body.rows, ctx, evaluator);
      return c.json({ data: result, error: null });
    } catch (err: any) {
      logger.error({ err }, 'pega/evaluate-decision-table failed');
      return c.json({ data: null, error: { code: 'INTERNAL_ERROR', message: err.message } }, 500);
    }
  });

  app.post('/pega/evaluate-decision-tree', async (c) => {
    try {
      const body = await c.req.json<{
        rootNode: DecisionTreeNode;
        clipboard?: Record<string, Record<string, unknown>>;
        currentPage?: string;
      }>();
      const ctx = new PegaClipboardContext(body.clipboard || {}, body.currentPage);
      const evaluator = new PegaExpressionEvaluator();
      const treeEval = new PegaDecisionTreeEvaluator();
      const result = treeEval.evaluate(body.rootNode, ctx, evaluator);
      return c.json({ data: result, error: null });
    } catch (err: any) {
      logger.error({ err }, 'pega/evaluate-decision-tree failed');
      return c.json({ data: null, error: { code: 'INTERNAL_ERROR', message: err.message } }, 500);
    }
  });

  app.post('/pega/render-section', async (c) => {
    try {
      const body = await c.req.json<{
        section: PegaSection;
        clipboard?: Record<string, Record<string, unknown>>;
        currentPage?: string;
      }>();
      const ctx = new PegaClipboardContext(body.clipboard || {}, body.currentPage);
      const sectionRenderer = new PegaSectionRenderer();
      const html = sectionRenderer.renderSection(body.section, ctx);
      return c.json({ data: { html }, error: null });
    } catch (err: any) {
      logger.error({ err }, 'pega/render-section failed');
      return c.json({ data: null, error: { code: 'INTERNAL_ERROR', message: err.message } }, 500);
    }
  });

  app.post('/pega/render-harness', async (c) => {
    try {
      const body = await c.req.json<{
        sections: { header?: PegaSection; content?: PegaSection; footer?: PegaSection };
        clipboard?: Record<string, Record<string, unknown>>;
        currentPage?: string;
      }>();
      const ctx = new PegaClipboardContext(body.clipboard || {}, body.currentPage);
      const assembler = new PegaHarnessAssembler();
      const html = assembler.assemble(body.sections, ctx);
      return c.json({ data: { html }, error: null });
    } catch (err: any) {
      logger.error({ err }, 'pega/render-harness failed');
      return c.json({ data: null, error: { code: 'INTERNAL_ERROR', message: err.message } }, 500);
    }
  });

  app.get('/pega/health', async (c) => {
    return c.json({
      data: {
        status: 'ok',
        cacheSize: evalCache.size,
        modules: {
          expression: true,
          workflow: true,
          constraints: true,
          when: true,
          validation: true,
          sandbox: true,
          cache: true,
          decisionTable: true,
          decisionTree: true,
          sectionRenderer: true,
          harnessAssembler: true,
        },
      },
      error: null,
    });
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

  return app;
}
