/**
 * Regression: /api/tools/execute (and /api/code/search) must stamp the trusted
 * tenant scope onto tool arguments using the canonical `__projectId`/`__userId`
 * keys — not only `_projectContext`. Code-intel tools read `__projectId` and are
 * fail-closed when absent, which made code_search return "No results found".
 *
 * A lightweight middleware injects `projectContext` from the X-Project-Id header
 * (matching production jwtAuth behaviour) so we can exercise the route without
 * the full JWT stack.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createToolsApiRoutes } from '../kb-api.js';

/** Captured args seen by the stub tool handler. */
let captured: Record<string, unknown> | undefined;

/** Minimal ModuleRegistry stub exposing a single capturing handler. */
function makeRegistry() {
  const handler = async (args: Record<string, unknown>) => {
    captured = args;
    return { content: [{ type: 'text', text: 'ok' }], isError: false };
  };
  return {
    getToolHandlers: () => new Map<string, typeof handler>([['code_search', handler]]),
    getAllToolDefinitions: () => [{ name: 'code_search', description: '', inputSchema: {} }],
  } as never;
}

const silentLogger = { error: () => {}, info: () => {}, warn: () => {}, debug: () => {} } as never;

function buildApp(): Hono {
  // Uses the real jwtAuth middleware (mounted inside createToolsApiRoutes),
  // which sets projectContext from the X-Project-Id header on the anonymous path.
  const app = new Hono();
  app.route('/api/tools', createToolsApiRoutes(makeRegistry(), silentLogger));
  return app;
}

function execute(headers: Record<string, string>, args: Record<string, unknown>): Promise<Response> {
  return buildApp().request('/api/tools/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ tool_name: 'code_search', arguments: args }),
  });
}

describe('/api/tools/execute — tenant scope stamping', () => {
  beforeEach(() => { captured = undefined; });

  it('stamps __projectId/__userId from projectContext (fixes empty code_search)', async () => {
    const res = await execute({ 'X-Project-Id': '7b11cdc169de' }, { query: 'viewSource' });
    expect(res.status).toBe(200);
    expect(captured).toBeDefined();
    expect(captured!.__projectId).toBe('7b11cdc169de');
    expect(captured!.__userId).toBe('anonymous');
    expect(captured!._projectContext).toMatchObject({ projectId: '7b11cdc169de' });
    expect(captured!.query).toBe('viewSource');
  });

  it('SEC-02: strips client-supplied reserved keys and uses trusted values', async () => {
    const res = await execute(
      { 'X-Project-Id': 'trusted-proj' },
      { query: 'x', __projectId: 'spoofed', __userId: 'attacker' },
    );
    expect(res.status).toBe(200);
    expect(captured!.__projectId).toBe('trusted-proj');
    expect(captured!.__userId).toBe('anonymous');
  });

  it('no X-Project-Id → empty projectId stamped (fail-closed downstream)', async () => {
    const res = await execute({}, { query: 'x', __projectId: 'spoofed' });
    expect(res.status).toBe(200);
    // jwtAuth anonymous path stamps an empty projectId; the client-supplied
    // spoofed value is stripped, so downstream scope filters remain fail-closed.
    expect(captured!.__projectId).toBeUndefined();
  });
});
