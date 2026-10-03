/**
 * Hono HTTP server setup with all routes and middleware.
 * DIP fix: ToolRouter and McpConfigService can be injected via HttpServerOptions.
 * Production defaults create them internally; tests can inject mocks.
 * Implements: UC-2, UC-7, BR-35, BR-37
 */

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import type { Logger } from 'pino';
import type { ModuleRegistry } from '../modules/ModuleRegistry.js';
import { ToolRouter } from '../tool-router/ToolRouter.js';
import { createHealthRoute } from './routes/health.js';
import { createToolsRoute } from './routes/tools.js';
import { createApiRoute } from './routes/api.js';
import { createProjectTypeRoutes } from './routes/project-type-routes.js';
import { createEnrichmentStatusRoutes } from './routes/enrichment-status-routes.js';
import { createAdminRoute } from './routes/admin.js';
import { createEntraAuthRoutes } from './routes/auth/entra.js';
import { createUnifiedAuthRoutes } from './routes/auth/unified.js';
import { createSsoDynamicRoutes } from './routes/auth/sso-dynamic.js';
import { createSsoProviderRoutes } from './routes/auth/sso-provider.js';
import { createMcpConfigRoutes } from '../modules/orchestration/McpConfigRoutes.js';
import { McpConfigService } from '../modules/orchestration/McpConfigService.js';
import { createRequestLogger } from './middleware/request-logger.js';
import { createErrorHandler } from './middleware/error-handler.js';
import { rateLimiter, loadPersistedRateLimitCap } from './middleware/rate-limiter.js';
import { securityHeaders } from './middleware/security-headers.js';
import { apiKeyAuth } from './middleware/api-key-auth.js';
import { jwtAuth, jwtAuthStrict } from './middleware/jwt-auth.js';
import { createKbApiRoutes, createToolsApiRoutes } from './routes/kb-api.js';
import { createRateLimitConfigRoutes } from './routes/rate-limit-config-routes.js';
import { createPegaApiRoutes } from './routes/pega-api.js';
import { createPegaStreamRoutes } from './routes/pega-stream.js';
import { createIngestRuleRoute } from './routes/pega-ingest-rule.js';
import { createPegaSchemaRoutes } from './routes/pega-schema-routes.js';
import { getDbAdapter } from '../admin/db/core.js';
import { ensureEngineIndexSchema } from '../database/schema-registry/ensure-engine-schema.js';
import { ensureSa4e101Tables } from '../database/schema-registry/ensure-sa4e-101.js';
import { ensureSa4e300Cleanup } from '../database/schema-registry/ensure-sa4e-300.js';
import { ensureSa4e302UniqueGraphEdges } from '../database/schema-registry/ensure-sa4e-302.js';
import { ensureSa4e303DropUnusedTables } from '../database/schema-registry/ensure-sa4e-303.js';
import { runStartupInterruptDetection } from '../engine/indexer/startup-interrupt-detector.js';
import { runMigrations } from '../engine/db/migrations.js';
import { runGraphMigrations } from '../engine/graph/migrator.js';
import { ensurePostgresIndexSchema } from '../database/migration/pg-schema-ensure.js';
import { CleanupScheduler } from '../engine/indexer/cleanup-scheduler.js';
import { createPegaSyncToKbRoutes } from './routes/pega-sync-to-kb.js';
import { createPegaReferenceRoutes } from './routes/pega-references.js';
import { createKnowledgeApiRoutes } from '../knowledge/routes.js';
import { bodyLimit } from 'hono/body-limit';
import { getMcpServer, registerTransport } from './mcpServer.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';

export interface HttpServerOptions {
  port: number;
  host: string;
  logger: Logger;
  registry: ModuleRegistry;
  version: string;
  /** DIP: optionally inject a pre-built ToolRouter (useful for testing). Defaults to new ToolRouter(registry). */
  toolRouter?: ToolRouter;
  /** DIP: optionally inject a pre-built McpConfigService. Defaults to new McpConfigService(workspace, dataDir). */
  mcpConfigService?: McpConfigService;
}

export class HttpServer {
  private app: Hono;
  private server: ReturnType<typeof serve> | null = null;
  private logger: Logger;
  private port: number;
  private host: string;
  private _isRunning = false;
  /** SA4E-101: periodic terminal-record cleanup (started after DB bootstrap). */
  private cleanupScheduler?: CleanupScheduler;

  constructor(private options: HttpServerOptions) {
    this.logger = options.logger;
    this.port = options.port;
    this.host = options.host;
    this.app = this.createApp();
  }

  private createApp(): Hono {
    const app = new Hono();
    // DIP: use injected ToolRouter or create default
    const toolRouter = this.options.toolRouter ?? new ToolRouter(this.options.registry, this.logger);

    app.use('*', securityHeaders);
    // Exempt streaming ingest from body limit — it uses ReadableStream getReader() directly
    app.use('*', async (c, next) => {
      if (c.req.path === '/api/v1/pega/ingest-stream') return next();
      return bodyLimit({ maxSize: 100 * 1024 * 1024 })(c, next);
    });
    app.use('*', createRequestLogger(this.logger));
    app.use('/api/admin/*', rateLimiter);
    app.use('/api/admin/auth/login', rateLimiter);
    app.use('/api/index/*', jwtAuth);
    app.use('/api/tags/*', apiKeyAuth);
    app.use('/mcp/*', apiKeyAuth);
    // SA4E-241 SEC-01: bind identity to the whole Pega route group (mounted at
    // /api/v1/pega/*). projectId is derived from the authenticated identity
    // (X-Project-Id / JWT pid), never from the request body (fail-closed).
    // Require login session for all Pega APIs except login itself.
    // Dev-friendly: use jwtAuth to allow anonymous when CODE_INTEL_REQUIRE_AUTH is false
    app.use('/api/v1/pega/*', jwtAuth);
    // Enforce login session for all /api/v1/* endpoints except login itself
    app.use('/api/v1/*', async (c, next) => {
      const path = c.req.path;
      if (path === '/api/v1/auth/login' || path.startsWith('/api/v1/auth/login/')) {
        return next();
      }
      return jwtAuthStrict(c, next);
    });
    // SA4E-241 SEC-08: per-identity rate limit on the Pega group (defense-in-depth).
    app.use('/api/v1/pega/*', rateLimiter);
    app.onError(createErrorHandler(this.logger));

    app.route('/', createHealthRoute(this.options.registry, this.options.version));
    app.route('/', createToolsRoute(toolRouter, this.logger));
    app.route('/', createApiRoute(this.options.registry, this.logger));
    app.route('/', createAdminRoute(this.logger, this.options.registry));
    app.route('/', createEntraAuthRoutes());
    // SA4E-308/309: generic multi-provider SSO route (google, github, ...).
    // Mounted AFTER Entra so the dedicated Entra route wins; this route also
    // explicitly skips 'entra' (RESERVED_PROVIDERS) as defense-in-depth.
    app.route('/', createSsoProviderRoutes());
    app.route('/', createUnifiedAuthRoutes());
    app.route('/auth', createSsoDynamicRoutes());

    this.registerMcpConfigRoutes(app);

    // SA4E-217: Rate limit config API
    const rateLimitConfigRoutes = createRateLimitConfigRoutes(this.logger);
    app.route('/api/v1', rateLimitConfigRoutes);

    const kbApiRoutes = createKbApiRoutes(this.options.registry, this.logger);
    app.route('/api/v1', kbApiRoutes);

    const pegaApiRoutes = createPegaApiRoutes(this.options.registry, this.logger);
    app.route('/api/v1', pegaApiRoutes);

    // SA4E-92: NDJSON streaming ingest — constant memory regardless of batch size
    const pegaStreamRoutes = createPegaStreamRoutes(this.options.registry, this.logger);
    app.route('/api/v1', pegaStreamRoutes);

    // SA4E-158: Sync indexed Pega rules to KB (Phase 2)
    const pegaSyncRoutes = createPegaSyncToKbRoutes(this.options.registry, this.logger);
    app.route('/api/v1', pegaSyncRoutes);

    // SA4E-237 (GD5): query Pega reference-resolution results
    const pegaRefRoutes = createPegaReferenceRoutes(this.options.registry, this.logger);
    app.route('/api/v1', pegaRefRoutes);

    // SA4E-156: Per-rule ingestion with relative extraction (BFS-compatible)
    const ingestRuleRoute = createIngestRuleRoute(this.options.registry, this.logger);
    app.route('/api/v1/pega/ingest-rule', ingestRuleRoute);

    // SA4E-95/SA4E-214: Schema generation + persistence (analyze/store/find/update).
    // Inject dbAdapter so SchemaStorageService can persist enriched schemas to the DB (single source of truth).
    const pegaSchemaRoutes = createPegaSchemaRoutes(this.logger, getDbAdapter());
    app.route('/api/v1', pegaSchemaRoutes);

    // SA4E-85 Phase 0: Backend-Driven Knowledge REST API (threads/messages/checkpoint/events/artifacts/agents)
    const knowledgeModule = this.options.registry.getModule('knowledge');
    if (knowledgeModule && 'getService' in knowledgeModule) {
      const svc = (knowledgeModule as { getService: () => import('../knowledge/KnowledgeService.js').KnowledgeService }).getService();
      const knowledgeRoutes = createKnowledgeApiRoutes(svc, this.logger);
      app.route('/api/v1', knowledgeRoutes);
    }

    const toolsApiRoutes = createToolsApiRoutes(this.options.registry, this.logger);
    app.route('/api/tools', toolsApiRoutes);

    // SA4E-108: Project type configs endpoint (extension fetches KB type definitions)
    const projectTypeRoutes = createProjectTypeRoutes(this.options.registry, this.logger);
    app.route('/api/v1', projectTypeRoutes);

    // SA4E-157: Enrichment status polling endpoint (JWT auth, no admin check)
    const enrichmentStatusRoutes = createEnrichmentStatusRoutes(this.options.registry, this.logger);
    app.route('/api/v1', enrichmentStatusRoutes);

    app.all('/mcp', async (c) => {
      const transport = new WebStandardStreamableHTTPServerTransport();
      registerTransport(transport);
      // Extract project context from HTTP headers for multi-tenant scope isolation
      const projectId = c.req.header('X-Project-Id') || '';
      const projectContext = projectId ? { projectId, userId: 'mcp-client' } : undefined;
      const server = getMcpServer(this.options.registry, this.logger, projectContext);
      await server.connect(transport);
      return transport.handleRequest(c.req.raw);
    });

    return app;
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = serve({
        fetch: this.app.fetch,
        port: this.port,
        hostname: this.host,
      }, async (info) => {
        this._isRunning = true;
        this.logger.info({ port: info.port, host: this.host }, 'Backend server started');
        // Apply any admin-persisted rate-limit cap (non-blocking; survives restart).
        loadPersistedRateLimitCap().catch((err) => {
          this.logger.debug({ err }, '[RateLimit] Failed to load persisted cap — using env default');
        });
        // SA4E-101: bootstrap persistent index-status tables, then mark stale
        // running ops as interrupted, then start the cleanup scheduler.
        // Ensure schema is ready before marking server as fully started to avoid E2E race.
        try {
          await ensureEngineIndexSchema();
          
          // Auto-run DB migrations on startup
          const adapter = getDbAdapter();
          const engine = adapter.getEngine();
          if (engine === 'sqlite') {
            await runMigrations(adapter, process.env.CODE_INTEL_PROJECT_ID || 'default');
            await runGraphMigrations(adapter);
            // SA4E-171: Recreate pending_tasks without FK to knowledge_entries (SQLite cannot DROP CONSTRAINT)
            // Force recreate on every start to guarantee no FK remains
            try {
              const rows = await adapter.allAsync<any>('SELECT id, task_type, entry_id, status, payload, error, retry_count, max_retries, project_id, priority, created_at, started_at, completed_at FROM pending_tasks');
              await adapter.execAsync(`DROP TABLE IF EXISTS pending_tasks`);
              await adapter.execAsync(`
                CREATE TABLE pending_tasks (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  task_type TEXT NOT NULL,
                  entry_id INTEGER NOT NULL,
                  status TEXT NOT NULL,
                  payload TEXT,
                  error TEXT,
                  retry_count INTEGER DEFAULT 0,
                  max_retries INTEGER DEFAULT 3,
                  project_id TEXT,
                  priority INTEGER DEFAULT 0,
                  created_at TEXT,
                  started_at TEXT,
                  completed_at TEXT
                )
              `);
              for (const r of rows) {
                await adapter.runAsync(
                  `INSERT INTO pending_tasks (id, task_type, entry_id, status, payload, error, retry_count, max_retries, project_id, priority, created_at, started_at, completed_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                  [r.id, r.task_type, r.entry_id, r.status, r.payload, r.error, r.retry_count, r.max_retries, r.project_id, r.priority, r.created_at, r.started_at, r.completed_at]
                );
              }
              this.logger.info('[startup] pending_tasks recreated without FK');
            } catch (e) {
              this.logger.warn({ e }, '[startup] pending_tasks recreation failed');
            }
          } else if (engine === 'postgresql') {
            await ensurePostgresIndexSchema(adapter);
          }
          
          await ensureSa4e101Tables();
          await runStartupInterruptDetection();
          await ensureSa4e300Cleanup();
          await ensureSa4e302UniqueGraphEdges();
          await ensureSa4e303DropUnusedTables();
          this.cleanupScheduler = new CleanupScheduler();
          this.cleanupScheduler.start();
        } catch (err) {
          this.logger.error(
            { err },
            '[startup] SA4E-101 persistence init failed — progress will not survive restart',
          );
        }
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (this.server) {
      this.cleanupScheduler?.stop();
      this.server.close();
      this._isRunning = false;
      this.logger.info('Backend server stopped');
    }
  }

  get isRunning(): boolean { return this._isRunning; }
  get honoApp(): Hono { return this.app; }

  private registerMcpConfigRoutes(app: Hono): void {
    const orchestration = this.options.registry.getModule('orchestration');
    if (!orchestration || !('getClientManager' in orchestration)) {
      this.logger.warn('OrchestrationModule not found, skipping MCP config routes');
      return;
    }
    const clientManager = (orchestration as { getClientManager: () => import('../modules/orchestration/McpClientManager.js').McpClientManager }).getClientManager?.();
    if (!clientManager) {
      this.logger.warn('McpClientManager not available, skipping MCP config routes');
      return;
    }
    // DIP: use injected McpConfigService or create default
    const configService = this.options.mcpConfigService ?? new McpConfigService(
      process.env.CODE_INTEL_WORKSPACE || process.cwd(),
      process.env.CODE_INTEL_DATA_DIR || '.code-intel',
      this.logger,
    );
    const mcpConfigApp = createMcpConfigRoutes(configService, clientManager, this.logger);
    app.route('/', mcpConfigApp);
    this.logger.info('MCP Config REST API registered at /api/mcp-servers');
  }
}
