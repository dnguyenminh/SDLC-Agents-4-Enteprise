/**
 * MCP Tools endpoints — GET /mcp/tools/list, POST /mcp/tools/call
 * Implements: UC-2, UC-7, BR-6, BR-7, BR-8, BR-9, BR-11
 */

import { Hono } from 'hono';
import { z } from 'zod';
import type { ToolRouter } from '../../tool-router/ToolRouter.js';
import type { Logger } from 'pino';
import { isApiKeyAuthEnabled } from '../middleware/api-key-auth.js';

const ToolCallSchema = z.object({
  tool_name: z.string().min(1, 'Missing required field: tool_name'),
  arguments: z.record(z.unknown()).default({}),
});

export function createToolsRoute(router: ToolRouter, logger: Logger): Hono {
  const app = new Hono();

  // GET /mcp/tools/list — list all available tool definitions
  app.get('/mcp/tools/list', (c) => {
    const tools = router.listTools();
    return c.json({ tools });
  });

  // POST /mcp/tools/call — execute an MCP tool
  app.post('/mcp/tools/call', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(
        { error: { code: 'INVALID_REQUEST', message: 'Invalid JSON body' } },
        400
      );
    }

    const parsed = ToolCallSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues.map(i => i.message).join('; ');
      return c.json(
        { error: { code: 'INVALID_REQUEST', message } },
        400
      );
    }

    const { tool_name, arguments: args } = parsed.data;

    // Inject user context for scope-aware tools (Finding #8: X-User-Id hardening)
    if (isApiKeyAuthEnabled()) {
      // When API key auth is active, ignore X-User-Id header entirely
      (args as any).__userId = 'api-key-user';
    } else {
      const userId = c.req.header('X-User-Id') || c.req.header('x-user-id');
      if (userId) {
        logger.warn({ userId }, 'X-User-Id header used without API key auth — identity unverified');
        (args as any).__userId = userId;
      }
    }

    // Check if tool exists
    const tools = router.listTools();
    const toolExists = tools.some(t => t.name === tool_name);
    if (!toolExists) {
      return c.json(
        { error: { code: 'TOOL_NOT_FOUND', message: `Tool '${tool_name}' not found` } },
        404
      );
    }

    // Execute tool
    const result = await router.route({ tool_name, arguments: args });
    return c.json(result, 200);
  });

  return app;
}