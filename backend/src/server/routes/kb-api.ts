/**
 * KB REST API Routes — SA4E-30
 * Replaces MCP tool interface with standard REST endpoints.
 * All routes require JWT auth via jwtAuth middleware.
 */

import { Hono } from 'hono';
import type { Logger } from 'pino';
import type { ModuleRegistry } from '../../modules/ModuleRegistry.js';
import { jwtAuth } from '../middleware/jwt-auth.js';
import { resolveCoreToolNames } from '../../config/CoreTools.js';

type KBEnv = { Variables: { projectContext: any } };

export function createKbApiRoutes(registry: ModuleRegistry, logger: Logger): Hono<KBEnv> {
  const api = new Hono<KBEnv>();
  api.use('*', jwtAuth);

  api.post('/memory/search', async (c) => {
    const ctx = c.get('projectContext');
    const body = await c.req.json();
    const handler = registry.getToolHandlers().get('mem_search');
    if (!handler) return c.json({ data: null, error: { code: 'NOT_FOUND', message: 'Not available' } }, 404);
    try {
      const result = await handler({ ...body, _projectContext: ctx });
      return c.json({ data: result, error: null });
    } catch (e: any) {
      logger.error({ err: e }, 'memory/search failed');
      return c.json({ data: null, error: { code: 'INTERNAL_ERROR', message: e.message } }, 500);
    }
  });

  api.post('/memory/ingest', async (c) => {
    const ctx = c.get('projectContext');
    const body = await c.req.json();
    const handler = registry.getToolHandlers().get('mem_ingest');
    if (!handler) return c.json({ data: null, error: { code: 'NOT_FOUND', message: 'Not available' } }, 404);
    try {
      const result = await handler({ ...body, _projectContext: ctx });
      return c.json({ data: result, error: null }, 201);
    } catch (e: any) {
      logger.error({ err: e }, 'memory/ingest failed');
      return c.json({ data: null, error: { code: 'INTERNAL_ERROR', message: e.message } }, 500);
    }
  });

  api.post('/memory/ingest-file', async (c) => {
    const ctx = c.get('projectContext');
    const body = await c.req.json();
    const handler = registry.getToolHandlers().get('mem_ingest_file');
    if (!handler) return c.json({ data: null, error: { code: 'NOT_FOUND', message: 'Not available' } }, 404);
    try {
      const result = await handler({ ...body, _projectContext: ctx });
      return c.json({ data: result, error: null }, 201);
    } catch (e: any) {
      logger.error({ err: e }, 'memory/ingest-file failed');
      return c.json({ data: null, error: { code: 'INTERNAL_ERROR', message: e.message } }, 500);
    }
  });

  api.post('/code/search', async (c) => {
    const body = await c.req.json();
    const handler = registry.getToolHandlers().get('code_search');
    if (!handler) return c.json({ data: null, error: { code: 'NOT_FOUND', message: 'Not available' } }, 404);
    try {
      const result = await handler(body);
      return c.json({ data: result, error: null });
    } catch (e: any) {
      logger.error({ err: e }, 'code/search failed');
      return c.json({ data: null, error: { code: 'INTERNAL_ERROR', message: e.message } }, 500);
    }
  });

  api.post('/context/curated', async (c) => {
    const body = await c.req.json();
    const handler = registry.getToolHandlers().get('get_curated_context');
    if (!handler) return c.json({ data: null, error: { code: 'NOT_FOUND', message: 'Not available' } }, 404);
    try {
      const result = await handler(body);
      return c.json({ data: result, error: null });
    } catch (e: any) {
      logger.error({ err: e }, 'context/curated failed');
      return c.json({ data: null, error: { code: 'INTERNAL_ERROR', message: e.message } }, 500);
    }
  });

  api.get('/admin/status', async (c) => {
    const handler = registry.getToolHandlers().get('orchestration_status');
    if (!handler) return c.json({ data: { status: 'healthy' }, error: null });
    try {
      const result = await handler({});
      return c.json({ data: result, error: null });
    } catch (e: any) {
      return c.json({ data: null, error: { code: 'INTERNAL_ERROR', message: e.message } }, 500);
    }
  });

  api.post('/admin/migrate-scope', async (c) => {
    const body = await c.req.json();
    if (!body.mapping || typeof body.mapping !== 'object') {
      return c.json({ data: null, error: { code: 'INVALID_REQUEST', message: 'mapping required' } }, 400);
    }
    const memModule = registry.getModule('memory') as any;
    if (!memModule?.migrateScopes) {
      return c.json({ data: null, error: { code: 'NOT_FOUND', message: 'Migration not available' } }, 404);
    }
    try {
      const result = await memModule.migrateScopes(body.mapping, body.dry_run ?? false);
      return c.json({ data: result, error: null });
    } catch (e: any) {
      logger.error({ err: e }, 'admin/migrate-scope failed');
      return c.json({ data: null, error: { code: 'INTERNAL_ERROR', message: e.message } }, 500);
    }
  });

  return api;
}


/** SA4E-30: REST endpoint for tools listing + generic tool execution. */
export function createToolsApiRoutes(registry: ModuleRegistry, logger: Logger): Hono<KBEnv> {
  const api = new Hono<KBEnv>();
  api.use('*', jwtAuth);

  // GET /api/tools — list ONLY CORE tools (tiered visibility, BR-01/BR-06)
  // Non-core tools are discovered via find_tools + execute_dynamic_tool
  api.get('/', (c) => {
    const coreNames = resolveCoreToolNames(logger);
    const allTools = registry.getAllToolDefinitions();
    const filtered = allTools.filter(t => coreNames.has(t.name));
    return c.json({ tools: filtered.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) });
  });

  // POST /api/tools/find — semantic tool search
  api.post('/find', async (c) => {
    const body = await c.req.json();
    const handler = registry.getToolHandlers().get('find_tools');
    if (!handler) return c.json({ data: null, error: { code: 'NOT_FOUND', message: 'find_tools not available' } }, 404);
    try {
      const result = await handler(body);
      return c.json({ data: result, error: null });
    } catch (e: any) {
      logger.error({ err: e }, 'tools/find failed');
      return c.json({ data: null, error: { code: 'INTERNAL_ERROR', message: e.message } }, 500);
    }
  });

  // POST /api/tools/execute — generic tool execution (replaces /mcp/tools/call)
  api.post('/execute', async (c) => {
    const ctx = c.get('projectContext');
    const body = await c.req.json();
    const toolName = body.tool_name || body.toolName;
    const args = body.arguments || {};
    if (!toolName) return c.json({ data: null, error: { code: 'INVALID_REQUEST', message: 'tool_name required' } }, 400);
    const handler = registry.getToolHandlers().get(toolName);
    if (!handler) return c.json({ data: null, error: { code: 'NOT_FOUND', message: `Tool ${toolName} not found` } }, 404);
    try {
      const result = await handler({ ...args, _projectContext: ctx });
      return c.json({ data: result, error: null });
    } catch (e: any) {
      logger.error({ err: e, tool: toolName }, 'tools/execute failed');
      return c.json({ data: null, error: { code: 'INTERNAL_ERROR', message: e.message } }, 500);
    }
  });

  return api;
}
