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
import { createAdminRoute } from './routes/admin.js';
import { createMcpConfigRoutes } from '../modules/orchestration/McpConfigRoutes.js';
import { McpConfigService } from '../modules/orchestration/McpConfigService.js';
import { createRequestLogger } from './middleware/request-logger.js';
import { createErrorHandler } from './middleware/error-handler.js';
import { rateLimiter } from './middleware/rate-limiter.js';
import { securityHeaders } from './middleware/security-headers.js';
import { apiKeyAuth } from './middleware/api-key-auth.js';
import { validateJwtConfig, jwtAuth } from './middleware/jwt-auth.js';
import { createKbApiRoutes, createToolsApiRoutes } from './routes/kb-api.js';
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
    app.use('*', bodyLimit({ maxSize: 100 * 1024 * 1024 }));
    app.use('*', createRequestLogger(this.logger));
    app.use('/api/admin/*', rateLimiter);
    app.use('/api/admin/auth/login', rateLimiter);
    app.use('/api/index/*', jwtAuth);
    app.use('/api/tags/*', apiKeyAuth);
    app.use('/mcp/*', apiKeyAuth);
    app.onError(createErrorHandler(this.logger));

    app.route('/', createHealthRoute(this.options.registry, this.options.version));
    app.route('/', createToolsRoute(toolRouter, this.logger));
    app.route('/', createApiRoute(this.options.registry, this.logger));
    app.route('/', createAdminRoute(this.logger, this.options.registry));

    this.registerMcpConfigRoutes(app);

    const kbApiRoutes = createKbApiRoutes(this.options.registry, this.logger);
    app.route('/api/v1', kbApiRoutes);

    const toolsApiRoutes = createToolsApiRoutes(this.options.registry, this.logger);
    app.route('/api/tools', toolsApiRoutes);

    app.all('/mcp', async (c) => {
      const transport = new WebStandardStreamableHTTPServerTransport();
      registerTransport(transport);
      const server = getMcpServer(this.options.registry, this.logger);
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
      }, (info) => {
        this._isRunning = true;
        this.logger.info({ port: info.port, host: this.host }, 'Backend server started');
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (this.server) {
      this.server.close();
      this._isRunning = false;
      this.logger.info('Backend server stopped');
    }
  }

  get isRunning(): boolean { return this._isRunning; }
  get honoApp(): Hono { return this.app; }

  private registerMcpConfigRoutes(app: Hono): void {
    const orchestration = this.options.registry.getModule('orchestration') as any;
    if (!orchestration) {
      this.logger.warn('OrchestrationModule not found, skipping MCP config routes');
      return;
    }
    const clientManager = orchestration.getClientManager?.();
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
