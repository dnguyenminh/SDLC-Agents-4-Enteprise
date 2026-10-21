/**
 * SA4E-367 — session loadout governance + discovery-pair routing (AC-3/AC-5).
 * STC: UT-08/09/10 (loadout: cap / role filter / minimal escalation) and the
 * discoveryTools wiring-split cases. Host customTools/allowlist suites (UT-06,
 * UT-07, IT-03) live in bridge-wiring-session.test.ts
 * (shared mocks: bridge-wiring-session-mocks.ts).
 */
import { describe, it, expect } from 'vitest';
import { ensureSessionHost, clearSessionHostCache } from '../pi-agent-session-host.js';
import { McpBridge } from '../../mcp/mcp-bridge';
import { buildMcpBridgeAgentTools } from '../../pi-agent/extensions/mcp-bridge-extension';
import { isDiscoveryTool } from '../../pi-agent/extensions/tool-definitions';
import { buildSessionToolLoadout, nameTools, toolSchemaTokenCap } from '../../pi-agent/tool-loadout.js';
import { estimateToolSchemaTokens } from '../../pi-agent/tool-schema-tokens.js';
import type { ContextBudget } from '../../pi-agent/models/ContextBudget';
import {
  BRIDGE_TOOL_NAMES,
  DISCOVERY_PAIR,
  runningManager,
  sessionOpts,
  mocks,
} from './bridge-wiring-session-mocks.js';

describe('Session loadout — SA4E-367 bridge names under governance (UT-08/09/10)', () => {
  const EXT_NAMES = ['compress', 'ext_tool'];
  // Large-tier budget literal — cap = floor(staticBudget × 0.25) (N-1).
  const budget: ContextBudget = {
    nCtx: 128000, reserveOutput: 8192, safetyMargin: 10240, staticBudget: 73728, historyBudget: 25856,
  };
  const cap = toolSchemaTokenCap(budget);

  // STC: UT-08 — bridge names ride mcpTools; schemaTokens grows by the name-only
  // estimate (N-3) and stays under the cap (N-1); core tools always present.
  it('UT-08: bridge names join mcpTools; schemaTokens grows exactly by the bridge estimate', () => {
    const baseline = buildSessionToolLoadout({ role: 'SM', schemaTokenCap: cap, mcpTools: nameTools(EXT_NAMES) });
    const withBridge = buildSessionToolLoadout({
      role: 'SM', schemaTokenCap: cap, mcpTools: nameTools([...EXT_NAMES, ...BRIDGE_TOOL_NAMES]),
    });
    for (const name of BRIDGE_TOOL_NAMES) expect(withBridge.loadout).toContain(name); // SM = '*' full pool
    const expectedDelta = BRIDGE_TOOL_NAMES.reduce((sum, n) => sum + estimateToolSchemaTokens({ name: n }), 0);
    expect(withBridge.schemaTokens - baseline.schemaTokens).toBe(expectedDelta); // name-only estimate (N-3)
    expect(withBridge.schemaTokens).toBeLessThanOrEqual(cap); // N-1
    for (const core of ['read', 'write', 'edit', 'grep', 'find', 'ls']) {
      expect(withBridge.loadout).toContain(core);
    }
  });

  // STC: UT-09 — role filter (AC-5): BA drops code_*, QA keeps it, absent role
  // fails open (full pool — BR-07 SA4E-355 behavior preserved).
  it('UT-09: role filter — BA drops code_search, QA keeps it, absent role keeps the full pool', () => {
    const loadoutFor = (role?: string): string[] =>
      buildSessionToolLoadout({
        role, schemaTokenCap: cap, mcpTools: nameTools([...BRIDGE_TOOL_NAMES]),
      }).loadout;
    const ba = loadoutFor('BA');
    expect(ba).not.toContain('code_search'); // prefix code_ ∉ ROLE_TOOL_PREFIXES.BA
    expect(ba).toEqual(expect.arrayContaining(['jira_get_issue', 'mem_search', 'mem_ingest']));
    expect(loadoutFor('QA')).toContain('code_search'); // ROLE_TOOL_PREFIXES.QA has code_
    expect(loadoutFor(undefined)).toEqual(expect.arrayContaining([...BRIDGE_TOOL_NAMES]));
  });

  // STC: UT-10 — escalation minimal: only core + discovery remain; bridge names
  // dropped (AF-1 UC-02). Wiring link: the escalated allowlist carries no bridge
  // names → SDK _refreshToolRegistry filters the bridge customTools out.
  it('UT-10: minimal escalation — bridge names dropped, core + discovery kept', () => {
    const result = buildSessionToolLoadout({ mcpTools: nameTools([...BRIDGE_TOOL_NAMES]), minimal: true });
    expect(result.minimal).toBe(true);
    for (const name of BRIDGE_TOOL_NAMES) expect(result.loadout).not.toContain(name);
    for (const core of ['read', 'write', 'edit', 'grep', 'find', 'ls']) {
      expect(result.loadout).toContain(core); // core file tools NEVER dropped (BR-06)
    }
  });
});

describe('Session path — SA4E-367 discovery-pair routing (AC-3/AC-5)', () => {
  // Large-tier budget literal (same as above — cap keeps the pair, N-1 holds).
  const budget: ContextBudget = {
    nCtx: 128000, reserveOutput: 8192, safetyMargin: 10240, staticBudget: 73728, historyBudget: 25856,
  };
  const cap = toolSchemaTokenCap(budget);

  // AC-3 wiring split: default build (no options) ⇒ dynamic set empty, so the
  // host routes discoveryTools: [] — byte-identical to today's call (W-2).
  it('default wiring split: 4 concrete, 0 dynamic — discoveryTools stays []', () => {
    const bridge = new McpBridge(runningManager());
    const built = buildMcpBridgeAgentTools(bridge); // wiring passes NO options
    const dynamic = built.map((t) => t.name).filter(isDiscoveryTool);
    const concrete = built.map((t) => t.name).filter((n) => !isDiscoveryTool(n));
    expect(concrete.sort()).toEqual(['code_search', 'jira_get_issue', 'mem_ingest', 'mem_search']);
    expect(dynamic).toEqual([]);
    const loadout = buildSessionToolLoadout({
      role: 'SM', schemaTokenCap: cap, discoveryTools: nameTools(dynamic), mcpTools: nameTools(concrete),
    });
    for (const name of DISCOVERY_PAIR) expect(loadout.loadout).not.toContain(name);
  });

  // AC-5: opted-in pair via discoveryTools survives the role filter that drops
  // code_search from mcpTools (filterByRole drops prefix-less names for known
  // roles — hence the never-dropped discoveryTools routing, §3.7).
  it("opted-in pair survives the BA role filter via discoveryTools (AC-5)", () => {
    const bridge = new McpBridge(runningManager());
    const built = buildMcpBridgeAgentTools(bridge, { allowDynamicChaining: true });
    expect(built).toHaveLength(6);
    const dynamic = built.map((t) => t.name).filter(isDiscoveryTool);
    const concrete = built.map((t) => t.name).filter((n) => !isDiscoveryTool(n));
    expect(dynamic.sort()).toEqual(['execute_dynamic_tool', 'find_tools']);
    const loadout = buildSessionToolLoadout({
      role: 'BA', schemaTokenCap: cap,
      discoveryTools: nameTools(dynamic),
      mcpTools: nameTools(concrete),
    });
    expect(loadout.loadout).not.toContain('code_search'); // BA drops code_ from mcpTools
    for (const name of DISCOVERY_PAIR) expect(loadout.loadout).toContain(name); // pair never dropped
    expect(loadout.schemaTokens).toBeLessThanOrEqual(cap); // gate-measured (N-1)
  });

  // Default session allowlist carries no pair names. (Host escalation composes
  // the allowlist from baseTools only — code-verified in createHost
  // `effectiveMinLoadout ? [...baseTools] : loadout.loadout`; gate-escalation
  // behavior itself is covered by the existing session-budget-gate suites.)
  it('default host allowlist carries no pair names', async () => {
    clearSessionHostCache();
    mocks.sessionOpts = undefined;
    const host = await ensureSessionHost({
      tabId: 'tab-esc', workspaceRoot: 'C:/ws/sa4e367-esc', providerId: 'p', apiKey: 'k',
      mcpBridge: new McpBridge(runningManager()),
    });
    // Default (non-escalated) session: allowlist mirrors the loadout — pair absent.
    for (const name of DISCOVERY_PAIR) expect(sessionOpts().tools ?? []).not.toContain(name);
    host.dispose();
  });
});
