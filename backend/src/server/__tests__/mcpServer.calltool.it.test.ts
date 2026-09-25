/**
 * IT-02 — CallTool success increments tool_usage; error result not counted.
 * Real getMcpServer + in-process Client + real temp SQLite (better-sqlite3).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ModuleRegistry } from '../../modules/ModuleRegistry.js';
import {
  StubModule, def, okHandler, errHandler, silentLogger, connectMcp,
  makeTempDb, type McpHarness, type TempDb,
} from '../../__tests__/sa4e-testkit.js';

describe('IT-02: CallTool usage counting', () => {
  let harness: McpHarness;
  let ctx: TempDb;

  beforeEach(async () => {
    ctx = makeTempDb();
    const registry = new ModuleRegistry(silentLogger());
    const handlers = new Map();
    handlers.set('mem_search', okHandler);
    handlers.set('failing_tool', errHandler);
    const defs = [def('mem_search', 'memory'), def('failing_tool', 'utility')];
    registry.register(new StubModule('memory', defs, handlers, ctx.engine, 'ready'));
    harness = await connectMcp(registry);
  });
  afterEach(async () => { await harness.close(); ctx.close(); });

  it('success increments counter (BR-07); error result not counted (BR-12)', async () => {
    const ok = await harness.client.callTool({ name: 'mem_search', arguments: {} });
    expect(ok.isError).toBeFalsy();
    expect((await ctx.engine.getToolUsage('mem_search'))[0].call_count).toBe(1);

    const bad = await harness.client.callTool({ name: 'failing_tool', arguments: {} });
    expect(bad.isError).toBe(true);
    expect(await ctx.engine.getToolUsage('failing_tool')).toEqual([]);
  });
});

/**
 * Regression: the MCP call handler must stamp the canonical scope keys
 * (`__projectId`/`__userId`) — not only `_projectContext` — so code-intel tools
 * and QueryLayer scope filters receive the tenant and are not fail-closed to
 * empty results. Reproduces the "code_search returns nothing" bug.
 */
describe('CallTool project scope stamping', () => {
  let harness: McpHarness;
  let ctx: TempDb;
  let received: Record<string, unknown> | undefined;

  beforeEach(async () => {
    ctx = makeTempDb();
    received = undefined;
    const registry = new ModuleRegistry(silentLogger());
    const handlers = new Map();
    handlers.set('code_search', async (args: Record<string, unknown>) => {
      received = args;
      return { content: [{ type: 'text', text: 'ok' }], isError: false };
    });
    registry.register(new StubModule(
      'memory', [def('code_search', 'memory')], handlers, ctx.engine, 'ready',
    ));
    harness = await connectMcp(registry, { projectId: '7b11cdc169de', userId: 'mcp-client' });
  });
  afterEach(async () => { await harness.close(); ctx.close(); });

  it('injects __projectId and __userId from projectContext into tool args', async () => {
    await harness.client.callTool({ name: 'code_search', arguments: { query: 'viewSource' } });
    expect(received).toBeDefined();
    expect(received!.__projectId).toBe('7b11cdc169de');
    expect(received!.__userId).toBe('mcp-client');
    // Preserve the object form consumed by the memory tool decorators.
    expect(received!._projectContext).toMatchObject({ projectId: '7b11cdc169de' });
    // Original args untouched.
    expect(received!.query).toBe('viewSource');
  });
});
