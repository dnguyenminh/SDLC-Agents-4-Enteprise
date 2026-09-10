/**
 * IT-03 — execute_dynamic_tool increments inner tool once; wrapper counted
 * separately in a distinct row (no double count). SA4E-18 BR-12/OI-3.
 * Real OrchestrationModule + real mcpServer + real temp SQLite.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ModuleRegistry } from '../../ModuleRegistry.js';
import { OrchestrationModule } from '../OrchestrationModule.js';
import {
  StubModule, def, okHandler, silentLogger, connectMcp,
  makeTempDb, type McpHarness, type TempDb,
} from '../../../__tests__/sa4e-testkit.js';

describe('IT-03: dynamic tool usage counting', () => {
  let harness: McpHarness;
  let ctx: TempDb;

  beforeEach(async () => {
    ctx = makeTempDb();
    const registry = new ModuleRegistry(silentLogger());
    const handlers = new Map();
    handlers.set('mem_admin', okHandler);
    registry.register(new StubModule('memory', [def('mem_admin', 'memory')], handlers, ctx.engine, 'ready'));
    const orch = new OrchestrationModule(silentLogger(), registry);
    await orch.initialize(); // no orchestration.json in temp workspace -> ready, no children
    registry.register(orch);
    harness = await connectMcp(registry);
  });
  afterEach(async () => { await harness.close(); ctx.close(); });

  it('inner tool counted once, wrapper counted in distinct row', async () => {
    const res = await harness.client.callTool({
      name: 'execute_dynamic_tool',
      arguments: { toolName: 'mem_admin', arguments: { action: 'status' } },
    });
    expect(res.isError).toBeFalsy();

    const inner = await ctx.engine.getToolUsage('mem_admin');
    const wrapper = await ctx.engine.getToolUsage('execute_dynamic_tool');
    expect(inner[0].call_count).toBe(1);
    expect(wrapper[0].call_count).toBe(1);
    expect(inner[0].tool_name).not.toBe(wrapper[0].tool_name);
  });
});

/**
 * Regression: execute_dynamic_tool must forward the trusted tenant scope
 * (__projectId/__userId/_projectContext) — stamped on the OUTER args — into the
 * nested LOCAL tool's arguments. Without this, scoped reads (code_search etc.)
 * invoked via find_tools/dynamic run fail-closed and return empty results.
 */
describe('execute_dynamic_tool scope propagation', () => {
  let harness: McpHarness;
  let ctx: TempDb;
  let seen: Record<string, unknown> | undefined;

  beforeEach(async () => {
    ctx = makeTempDb();
    seen = undefined;
    const registry = new ModuleRegistry(silentLogger());
    const handlers = new Map();
    // Capturing handler standing in for a scoped code-intel tool.
    handlers.set('code_search', async (a: Record<string, unknown>) => {
      seen = a;
      return { content: [{ type: 'text', text: 'ok' }], isError: false };
    });
    registry.register(new StubModule('memory', [def('code_search', 'memory')], handlers, ctx.engine, 'ready'));
    const orch = new OrchestrationModule(silentLogger(), registry);
    await orch.initialize();
    registry.register(orch);
    // projectContext → MCP handler stamps __projectId/__userId on the OUTER args.
    harness = await connectMcp(registry, { projectId: '7b11cdc169de', userId: 'mcp-client' });
  });
  afterEach(async () => { await harness.close(); ctx.close(); });

  it('forwards __projectId/__userId into the nested tool arguments', async () => {
    await harness.client.callTool({
      name: 'execute_dynamic_tool',
      arguments: { toolName: 'code_search', arguments: { query: 'viewSource' } },
    });
    expect(seen).toBeDefined();
    expect(seen!.__projectId).toBe('7b11cdc169de');
    expect(seen!.__userId).toBe('mcp-client');
    expect(seen!.query).toBe('viewSource');
  });
});
