/**
 * MCP Tools endpoints — GET /mcp/tools/list, POST /mcp/tools/call
 * Implements: UC-2, UC-7, BR-6, BR-7, BR-8, BR-9, BR-11
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import type { ToolRouter } from '../../tool-router/ToolRouter.js';
import type { Logger } from 'pino';
import { isApiKeyAuthEnabled } from '../middleware/api-key-auth.js';
import { verifyJwtToken, allowedProjectsFromClaims } from '../middleware/jwt-auth.js';

/** SA4E-41 SEC-02: server-controlled scope keys clients must NEVER supply. */
const RESERVED_SCOPE_KEYS = ['__projectId', '__userId', '__workspaceRoot'] as const;

const ToolCallSchema = z.object({
  tool_name: z.string().min(1, 'Missing required field: tool_name'),
  arguments: z.record(z.unknown()).default({}),
});

type Args = Record<string, unknown>;

/** SEC-02: drop any client-supplied reserved scope keys before we stamp trusted ones. */
function stripReservedKeys(args: Args): void {
  for (const key of RESERVED_SCOPE_KEYS) delete args[key];
}

/** Stamp the trusted user identity (never from client args). */
function stampUserId(c: Context, args: Args, logger: Logger): void {
  if (isApiKeyAuthEnabled()) {
    args.__userId = 'api-key-user';
    return;
  }
  const userId = c.req.header('X-User-Id') || c.req.header('x-user-id');
  if (userId) {
    logger.warn({ userId }, 'X-User-Id header used without API key auth — identity unverified');
    args.__userId = userId;
  }
}

/**
 * SEC-03: bind X-Project-Id to the authenticated principal. When the caller
 * presents a valid JWT carrying a project/workspace grant, the requested project
 * must be inside that grant; otherwise reject. Shared-API-key/opaque principals
 * have no per-tenant grant, so we keep current behavior but log a warning.
 * Returns an error message when the binding must be rejected (HTTP 403).
 */
async function verifyProjectBinding(c: Context, projectId: string | undefined, logger: Logger): Promise<string | null> {
  const authHeader = c.req.header('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return null; // no JWT principal → shared-key path (see below)

  const { valid, payload } = await verifyJwtToken(token);
  if (!valid || !payload) return null; // opaque/admin-session token → no per-tenant grant

  const granted = allowedProjectsFromClaims(payload);
  if (granted.length === 0) return null; // JWT without project claim → no grant to enforce
  if (projectId && !granted.includes(projectId)) {
    logger.warn({ projectId, granted, sub: payload.sub }, 'SEC-03: X-Project-Id outside principal grant — rejected');
    return `X-Project-Id '${projectId}' is not permitted for this principal`;
  }
  return null;
}

/** Stamp the trusted project + workspace scope from headers (after strip + bind). */
function stampProjectScope(c: Context, args: Args, logger: Logger): void {
  const projectId = c.req.header('X-Project-Id') || c.req.header('x-project-id');
  if (projectId) {
    args.__projectId = projectId;
  } else if (!isApiKeyAuthEnabled()) {
    // TODO(SA4E-41 SEC-03): issue per-tenant API keys / JWT grants so a missing
    // header can be resolved from the principal instead of relying on the caller.
    logger.warn('No X-Project-Id header — code-intel reads will be fail-closed (empty)');
  }
  const workspaceRoot = c.req.header('X-Workspace-Root') || c.req.header('x-workspace-root');
  if (workspaceRoot) args.__workspaceRoot = workspaceRoot;
}

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
      return c.json({ error: { code: 'INVALID_REQUEST', message: 'Invalid JSON body' } }, 400);
    }

    const parsed = ToolCallSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues.map(i => i.message).join('; ');
      return c.json({ error: { code: 'INVALID_REQUEST', message } }, 400);
    }

    const { tool_name, arguments: args } = parsed.data;

    // SEC-02: strip client-supplied reserved keys UNCONDITIONALLY, then stamp trusted values.
    stripReservedKeys(args as Args);
    stampUserId(c, args as Args, logger);

    // SEC-03: bind requested tenant to the authenticated principal's grant.
    const requestedProject = c.req.header('X-Project-Id') || c.req.header('x-project-id');
    const bindingError = await verifyProjectBinding(c, requestedProject, logger);
    if (bindingError) {
      return c.json({ error: { code: 'FORBIDDEN', message: bindingError } }, 403);
    }
    stampProjectScope(c, args as Args, logger);

    // Check if tool exists
    const tools = router.listTools();
    if (!tools.some(t => t.name === tool_name)) {
      return c.json({ error: { code: 'TOOL_NOT_FOUND', message: `Tool '${tool_name}' not found` } }, 404);
    }

    const result = await router.route({ tool_name, arguments: args });
    return c.json(result, 200);
  });

  return app;
}
