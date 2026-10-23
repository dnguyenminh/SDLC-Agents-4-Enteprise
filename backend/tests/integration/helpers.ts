/**
 * Shared harness for auth flow integration tests (KSA-285).
 * See auth.*.test.ts files in this folder.
 */
import { Hono } from 'hono';
import { createAdminRoute } from '../../src/server/routes/admin.js';
import { initAdapters } from '../../src/admin/admin-db.js';
import { TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD } from '../test-credentials.js';
import pino from 'pino';

export const logger = pino({ level: 'silent' });

export interface AuthHarness {
  app: Hono;
  adminToken: string;
  /** Auth headers defaulting to the admin token (same semantics as the original suite). */
  authHeaders(token?: string): Record<string, string>;
}

export async function createAuthHarness(): Promise<AuthHarness> {
  // Await shared DB init (schema + admin seed) — otherwise login races
  // seeding and every authenticated request 401s.
  await initAdapters();
  const app = new Hono();
  const adminRoute = createAdminRoute(logger);
  app.route('/', adminRoute);

  // Login as admin
  const res = await app.request('/api/admin/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: TEST_ADMIN_USERNAME, password: TEST_ADMIN_PASSWORD }),
  });
  const data = (await res.json()) as any;
  const adminToken = data.token;

  const authHeaders = (token?: string) => ({
    Authorization: `Bearer ${token || adminToken}`,
    'Content-Type': 'application/json',
  });

  return { app, adminToken, authHeaders };
}

export { TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD };

/**
 * Shared harness for MCP tools integration tests (KSA-284).
 * Registers Memory/Orchestration/Utility modules in-process (see mcp-tools.*.test.ts).
 */
import { ModuleRegistry } from '../../src/modules/ModuleRegistry.js';
import { MemoryModule } from '../../src/modules/memory/MemoryModule.js';
import { OrchestrationModule } from '../../src/modules/orchestration/OrchestrationModule.js';
import { UtilityModule } from '../../src/modules/utility/UtilityModule.js';
import { ToolRouter } from '../../src/tool-router/ToolRouter.js';
import { createHealthRoute } from '../../src/server/routes/health.js';
import { createToolsRoute } from '../../src/server/routes/tools.js';

export const MCP_VERSION = '1.0.0-test';

// SA4E-41: /mcp/tools/list requires auth. Use the API key seeded in vitest.setup.ts.
export const MCP_AUTH_HEADERS = { 'X-API-Key': process.env.CODE_INTEL_API_KEY || 'test-api-key-01' };

export interface McpToolsHarness {
  app: Hono;
  registry: ModuleRegistry;
}

export async function createMcpToolsHarness(): Promise<McpToolsHarness> {
  const registry = new ModuleRegistry(logger);
  registry.register(new MemoryModule(logger));
  registry.register(new OrchestrationModule(logger, registry));
  registry.register(new UtilityModule(logger));
  await registry.initializeAll();

  const toolRouter = new ToolRouter(registry, logger);
  const app = new Hono();
  app.route('/', createHealthRoute(registry, MCP_VERSION));
  app.route('/', createToolsRoute(toolRouter, logger));
  return { app, registry };
}
