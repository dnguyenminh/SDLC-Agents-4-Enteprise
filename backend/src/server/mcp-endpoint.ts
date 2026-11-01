/**
 * MCP transport mounting — extracted from HttpRouteRegistrar.ts (BR-18 SRP split).
 * Owns: streamable-HTTP /mcp endpoint + MCP config REST API registration.
 */

import { Hono } from 'hono';
import type { Logger } from 'pino';
import type { HttpServerOptions } from './HttpRouteRegistrar.js';
import { getMcpServer, registerTransport } from './mcpServer.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createMcpConfigRoutes } from '../modules/orchestration/McpConfigRoutes.js';
import { McpConfigService } from '../modules/orchestration/McpConfigService.js';

/** SA4E-85: MCP streamable HTTP endpoint with per-project tenant context. */
export function mountMcpEndpoint(app: Hono, options: HttpServerOptions): void {
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
export function registerMcpConfigRoutes(app: Hono, options: HttpServerOptions): void {
  const logger: Logger = options.logger;
  const orchestration = options.registry.getModule('orchestration');
  if (!orchestration || !('getClientManager' in orchestration)) {
    logger.warn('OrchestrationModule not found, skipping MCP config routes');
    return;
  }
  const clientManager = (orchestration as { getClientManager: () => import('../modules/orchestration/McpClientManager.js').McpClientManager }).getClientManager?.();
  if (!clientManager) {
    logger.warn('McpClientManager not available, skipping MCP config routes');
    return;
  }
  // DIP: use injected McpConfigService or create default
  const configService = options.mcpConfigService ?? new McpConfigService(
    process.env.CODE_INTEL_WORKSPACE || process.cwd(),
    process.env.CODE_INTEL_DATA_DIR || '.code-intel',
    logger,
  );
  app.route('/', createMcpConfigRoutes(configService, clientManager, logger));
  logger.info('MCP Config REST API registered at /api/mcp-servers');
}
