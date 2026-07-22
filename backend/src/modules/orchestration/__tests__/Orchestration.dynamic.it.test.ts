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
