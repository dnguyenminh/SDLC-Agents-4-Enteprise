/**
 * Hono app assembly: middleware stack, route mounting, MCP transport.
 * Extracted from HttpServer.ts. DIP: ToolRouter and McpConfigService are
 * injected via HttpServerOptions; production defaults are created internally.
 * Implements: UC-2, UC-7, BR-35, BR-37
 */

import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
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
import { rateLimiter } from './middleware/rate-limiter.js';
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
import { createPegaSyncToKbRoutes } from './routes/pega-sync-to-kb.js';
import { createPegaReferenceRoutes } from './routes/pega-references.js';
import { createKnowledgeApiRoutes } from '../knowledge/routes.js';
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

/** Build the fully-configured Hono app (middleware + routes + MCP endpoint). */
export function createConfiguredApp(options: HttpServerOptions): Hono {
  const logger = options.logger;
  const app = new Hono();
  // DIP: use injected ToolRouter or create default
  const toolRouter = options.toolRouter ?? new ToolRouter(options.registry, logger);

  registerMiddleware(app, logger);
  app.onError(createErrorHandler(logger));

  mountCoreRoutes(app, options, toolRouter);
  mountApiRoutes(app, options);
  mountMcpEndpoint(app, options);

  return app;
}

/** Global middleware stack: security, logging, rate limits, auth gates. */
function registerMiddleware(app: Hono, logger: Logger): void {
  app.use('*', securityHeaders);
  // Exempt streaming ingest from body limit — it uses ReadableStream getReader() directly
  app.use('*', async (c, next) => {
    if (c.req.path === '/api/v1/pega/ingest-stream') return next();
    return bodyLimit({ maxSize: 100 * 1024 * 1024 })(c, next);
  });
  app.use('*', createRequestLogger(logger));
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
}

/** Health/tools/api/admin/auth routes. */
function mountCoreRoutes(app: Hono, options: HttpServerOptions, toolRouter: ToolRouter): void {
  app.route('/', createHealthRoute(options.registry, options.version));
  app.route('/', createToolsRoute(toolRouter, options.logger));
  app.route('/', createApiRoute(options.registry, options.logger));
  app.route('/', createAdminRoute(options.logger, options.registry));
  app.route('/', createEntraAuthRoutes());
  // SA4E-308/309: generic multi-provider SSO route (google, github, ...).
  // Mounted AFTER Entra so the dedicated Entra route wins; this route also
  // explicitly skips 'entra' (RESERVED_PROVIDERS) as defense-in-depth.
  app.route('/', createSsoProviderRoutes());
  app.route('/', createUnifiedAuthRoutes());
  app.route('/auth', createSsoDynamicRoutes());
  registerMcpConfigRoutes(app, options);
}

/** Versioned business API route groups (mounted at /api/v1 or /api/tools). */
function mountApiRoutes(app: Hono, options: HttpServerOptions): void {
  // SA4E-217: Rate limit config API
  app.route('/api/v1', createRateLimitConfigRoutes(options.logger));

  app.route('/api/v1', createKbApiRoutes(options.registry, options.logger));
  app.route('/api/v1', createPegaApiRoutes(options.registry, options.logger));

  // SA4E-92: NDJSON streaming ingest — constant memory regardless of batch size
  app.route('/api/v1', createPegaStreamRoutes(options.registry, options.logger));

  // SA4E-158: Sync indexed Pega rules to KB (Phase 2)
  app.route('/api/v1', createPegaSyncToKbRoutes(options.registry, options.logger));

  // SA4E-237 (GD5): query Pega reference-resolution results
  app.route('/api/v1', createPegaReferenceRoutes(options.registry, options.logger));

  // SA4E-156: Per-rule ingestion with relative extraction (BFS-compatible)
  app.route('/api/v1/pega/ingest-rule', createIngestRuleRoute(options.registry, options.logger));

  // SA4E-95/SA4E-214: Schema generation + persistence (analyze/store/find/update).
  // Inject dbAdapter so SchemaStorageService can persist enriched schemas to the DB (single source of truth).
  app.route('/api/v1', createPegaSchemaRoutes(options.logger, getDbAdapter()));

  // SA4E-85 Phase 0: Backend-Driven Knowledge REST API (threads/messages/checkpoint/events/artifacts/agents)
  const knowledgeModule = options.registry.getModule('knowledge');
  if (knowledgeModule && 'getService' in knowledgeModule) {
    const svc = (knowledgeModule as { getService: () => import('../knowledge/KnowledgeService.js').KnowledgeService }).getService();
    app.route('/api/v1', createKnowledgeApiRoutes(svc, options.logger));
  }

  app.route('/api/tools', createToolsApiRoutes(options.registry, options.logger));

  // SA4E-108: Project type configs endpoint (extension fetches KB type definitions)
  app.route('/api/v1', createProjectTypeRoutes(options.registry, options.logger));

  // SA4E-157: Enrichment status polling endpoint. The /status route is JWT-only;
  // the sensitive /failures, /retry and /reconcile routes self-gate with an admin
  // permission check (requireEnrichmentAdmin, SA4E-338 S1) inside the router.
  app.route('/api/v1', createEnrichmentStatusRoutes(options.registry, options.logger));
}

/** SA4E-85: MCP streamable HTTP endpoint with per-project tenant context. */
function mountMcpEndpoint(app: Hono, options: HttpServerOptions): void {
  app.all('/mcp', async (c) => {
    const transport = new WebStandardStreamableHTTPServerTransport();
    registerTransport(transport);
    // Extract project context from HTTP headers for multi-tenant scope isolation
    const projectId = c.req.header('X-Project-Id') || '';
    const projectContext = projectId ? { projectId, userId: 'mcp-client' } : undefined;
    const server = getMcpServer(options.registry, options.logger, projectContext);
    await server.connect(transport);
    return transport.handleRequest(c.req.raw);
  });
}

/** DIP: MCP config REST API (skipped when orchestration module is absent). */
function registerMcpConfigRoutes(app: Hono, options: HttpServerOptions): void {
  const orchestration = options.registry.getModule('orchestration');
  if (!orchestration || !('getClientManager' in orchestration)) {
    options.logger.warn('OrchestrationModule not found, skipping MCP config routes');
    return;
  }
  const clientManager = (orchestration as { getClientManager: () => import('../modules/orchestration/McpClientManager.js').McpClientManager }).getClientManager?.();
  if (!clientManager) {
    options.logger.warn('McpClientManager not available, skipping MCP config routes');
    return;
  }
  // DIP: use injected McpConfigService or create default
  const configService = options.mcpConfigService ?? new McpConfigService(
    process.env.CODE_INTEL_WORKSPACE || process.cwd(),
    process.env.CODE_INTEL_DATA_DIR || '.code-intel',
    options.logger,
  );
  app.route('/', createMcpConfigRoutes(configService, clientManager, options.logger));
  options.logger.info('MCP Config REST API registered at /api/mcp-servers');
}
