/**
 * Hono HTTP server setup with all routes and middleware.
 * Implements: UC-2, UC-7, BR-35, BR-37
 */

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
// fs import removed (unused)
// path import removed (unused)
// fileURLToPath import removed (unused)
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
import { bodyLimit } from 'hono/body-limit';
import { getMcpServer, registerTransport } from './mcpServer.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';

export interface HttpServerOptions {
  port: number;
  host: string;
  logger: Logger;
  registry: ModuleRegistry;
  version: string;
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
    const toolRouter = new ToolRouter(this.options.registry, this.logger);

    // Global middleware
    app.use('*', securityHeaders);
    app.use('*', bodyLimit({ maxSize: 10 * 1024 * 1024 })); // 10MB max request body
    app.use('*', createRequestLogger(this.logger));
    app.use('/api/admin/*', rateLimiter); // 100 req/min per IP on admin API
    app.use('/api/admin/auth/login', rateLimiter); // Additional login protection (stacked)

    // API key auth on public endpoints (Finding #3)
    app.use('/api/index/*', apiKeyAuth);
    app.use('/api/tags/*', apiKeyAuth);
    app.use('/mcp/*', apiKeyAuth);
    app.onError(createErrorHandler(this.logger));
    // Routes
    const healthRoute = createHealthRoute(this.options.registry, this.options.version);
    const toolsRoute = createToolsRoute(toolRouter, this.logger);
    const apiRoute = createApiRoute(this.options.registry, this.logger);
    const adminRoute = createAdminRoute(this.logger, this.options.registry);

    app.route('/', healthRoute);
    app.route('/', toolsRoute);
    app.route('/', apiRoute);
    app.route('/', adminRoute);

    // MCP Config REST API (Story 13 — config persistence)
    this.registerMcpConfigRoutes(app);

    // MCP Streamable HTTP endpoint
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

  get isRunning(): boolean {
    return this._isRunning;
  }

  get honoApp(): Hono {
    return this.app;
  }

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
    const cfg = { workspace: process.env.CODE_INTEL_WORKSPACE || process.cwd(), dataDir: process.env.CODE_INTEL_DATA_DIR || '.code-intel' };
    const configService = new McpConfigService(cfg.workspace, cfg.dataDir, this.logger);
    const mcpConfigApp = createMcpConfigRoutes(configService, clientManager, this.logger);
    app.route('/', mcpConfigApp);
    this.logger.info('MCP Config REST API registered at /api/mcp-servers');
  }
}
