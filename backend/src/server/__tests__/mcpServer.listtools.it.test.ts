/**
 * IT-01 — ListTools handler returns exactly the CORE tools (SA4E-18).
 * Drives the real getMcpServer via an in-process MCP Client. Registry is a
 * real ModuleRegistry populated with the full tool set (CORE + EXTENDED).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ModuleRegistry } from '../../modules/ModuleRegistry.js';
import {
  StubModule, def, okHandler, silentLogger, connectMcp, CORE_TOOL_NAMES, type McpHarness,
} from '../../__tests__/sa4e-testkit.js';

const CORE_DEFS = CORE_TOOL_NAMES.map(n => def(n, n.startsWith('mem') || n === 'code_search' || n === 'get_curated_context' ? 'memory' : 'orchestration'));
const EXTENDED = ['mem_admin', 'mem_promote', 'agent_log', 'mem_audit'];
const EXT_DEFS = EXTENDED.map(n => def(n, 'memory'));

describe('IT-01: ListTools filtered to CORE', () => {
  let harness: McpHarness;
  let registry: ModuleRegistry;

  beforeEach(async () => {
    registry = new ModuleRegistry(silentLogger());
    const handlers = new Map();
    for (const d of [...CORE_DEFS, ...EXT_DEFS]) handlers.set(d.name, okHandler);
    registry.register(new StubModule('toolset', [...CORE_DEFS, ...EXT_DEFS], handlers));
    harness = await connectMcp(registry);
  });
  afterEach(async () => { await harness.close(); });

  it('returns exactly the CORE tools, no EXTENDED (BR-01/BR-02/BR-11)', async () => {
    const res = await harness.client.listTools();
    const names = res.tools.map(t => t.name).sort();
    expect(res.tools.length).toBe(CORE_TOOL_NAMES.length);
    expect(names).toEqual([...CORE_TOOL_NAMES].sort());
    for (const ext of EXTENDED) expect(names).not.toContain(ext);
  });
});
