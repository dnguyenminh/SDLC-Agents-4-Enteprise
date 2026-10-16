/**
 * SA4E-367 — bridge tools wired into the SESSION path (PiAgentSessionHost).
 * Ported from SA4E-364 (commit 180b150) + SA4E-367 pair-routing cases:
 * default host passes NO options ⇒ discoveryTools [] (pair absent); opted-in
 * pair survives the role filter via discoveryTools (never dropped).
 *
 * STC: UT-06 (customTools + allowlist), UT-07 (FR-09 prompt metadata override),
 * UT-08/09/10 (loadout: cap / role filter / minimal escalation), IT-03
 * (instanceof type-guard — real instance → 4 tools; absent/foreign → []).
 * Pattern: mock '@earendil-works/pi-coding-agent' from
 * pi-agent-session-host.test.ts:34-58. The McpBridge is the REAL class from
 * the same module (TDD R-7 — no vi.mock of mcp-bridge; instanceof must match).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mocks } = vi.hoisted(() => {
  const promptCalls: string[] = [];
  let subscribed = 0;
  const mocks = {
    promptCalls,
    setRuntimeApiKey: vi.fn(async (_p: string, _k: string) => undefined),
    sessionOpts: undefined as unknown,
    get subscribed() {
      return subscribed;
    },
    session: {
      subscribe: (listener: (e: unknown) => void) => {
        subscribed++;
        mocks.listener = listener;
        return () => undefined;
      },
      prompt: async (text: string) => {
        promptCalls.push(text);
        mocks.listener?.({
          type: 'message_update',
          assistantMessageEvent: { type: 'text_delta', delta: 'session says hi' },
        });
      },
      dispose: vi.fn(),
    },
    listener: null as null | ((e: unknown) => void),
  };
  return { mocks };
});

vi.mock('@earendil-works/pi-coding-agent', () => ({
  getAgentDir: () => '/tmp/pi-agent-test',
  ModelRuntime: {
    create: async () => ({
      setRuntimeApiKey: mocks.setRuntimeApiKey,
      registerProvider: () => undefined,
      getModel: (_p: string, _m: string) => ({ id: 'test-model' }),
      getModels: () => [{ id: 'test-model' }],
    }),
  },
  SettingsManager: { create: () => ({}) },
  SessionManager: {
    create: () => ({ getSessionFile: () => '/tmp/pi-agent-test/sessions/s1.jsonl' }),
  },
  DefaultResourceLoader: class {
    constructor(_opts: unknown) {
      void _opts;
    }
  },
  createAgentSession: async (opts: unknown) => {
    mocks.sessionOpts = opts;
    return { session: mocks.session };
  },
  createEventBus: () => ({}),
}));

vi.mock('../pi-extension-runtime.js', () => ({
  getPiExtensionEntries: vi.fn(() => []),
  getPiExtensionAgentTools: vi.fn(async () => ({
    tools: [{ name: 'compress' }, { name: 'ext_tool' }],
    loaded: ['x'],
    skipped: [],
  })),
}));

import { ensureSessionHost, clearSessionHostCache } from '../pi-agent-session-host.js';
import { McpBridge } from '../../mcp/mcp-bridge';
import { buildMcpBridgeAgentTools } from '../../pi-agent/extensions/mcp-bridge-extension';
import { isDiscoveryTool } from '../../pi-agent/extensions/tool-definitions';
import { buildSessionToolLoadout, nameTools, toolSchemaTokenCap } from '../../pi-agent/tool-loadout.js';
import { estimateToolSchemaTokens } from '../../pi-agent/tool-schema-tokens.js';
import type { ContextBudget } from '../../pi-agent/models/ContextBudget';

const BRIDGE_TOOL_NAMES = ['jira_get_issue', 'mem_search', 'mem_ingest', 'code_search'] as const;
// SA4E-367: the gated discovery pair — absent by default, routed via
// discoveryTools (never dropped) only when explicitly opted in.
const DISCOVERY_PAIR = ['find_tools', 'execute_dynamic_tool'] as const;

type SessionToolDef = {
  name?: string;
  label?: string;
  promptSnippet?: string;
  promptGuidelines?: string[];
  execute?: unknown;
};

const sessionOpts = (): { customTools?: SessionToolDef[]; tools?: string[] } =>
  mocks.sessionOpts as { customTools?: SessionToolDef[]; tools?: string[] };

const bridgeToolsIn = (customTools: SessionToolDef[] | undefined): SessionToolDef[] =>
  (customTools ?? []).filter((t) => (BRIDGE_TOOL_NAMES as readonly string[]).includes(t.name ?? ''));

const pairToolsIn = (customTools: SessionToolDef[] | undefined): SessionToolDef[] =>
  (customTools ?? []).filter((t) => (DISCOVERY_PAIR as readonly string[]).includes(t.name ?? ''));

const runningManager = () =>
  ({ status: 'running', invokeTool: vi.fn().mockResolvedValue('') }) as never;

describe('PiAgentSessionHost — SA4E-367 bridge tools in the SESSION path', () => {
  beforeEach(() => {
    clearSessionHostCache();
    mocks.promptCalls.length = 0;
    mocks.sessionOpts = undefined;
  });

  // STC: UT-06 — customTools: 2 existing + 4 bridge; allowlist contains the 4 names.
  it('UT-06: customTools carry 2 existing + 4 bridge tools; allowlist includes bridge names', async () => {
    const host = await ensureSessionHost({
      workspaceRoot: 'C:/ws/sa4e367-s1',
      providerId: 'anthropic',
      apiKey: 'k',
      configuredModelId: 'm',
      mcpBridge: new McpBridge(runningManager()),
    });
    const opts = sessionOpts();
    const names = (opts.customTools ?? []).map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['get_workspace_info', 'read_method', ...BRIDGE_TOOL_NAMES]));
    // Bridge entries keep the ToolDefinition shape (name/label/execute via converter).
    for (const tool of bridgeToolsIn(opts.customTools)) {
      expect(tool.label).toBeTruthy();
      expect(typeof tool.execute).toBe('function');
    }
    // SDK isAllowedTool filters customTools by this allowlist — bridge names in.
    expect(opts.tools).toEqual(expect.arrayContaining([...BRIDGE_TOOL_NAMES]));
    // AC-3 at the registry level: no discovery-pair tool registered as a custom tool.
    for (const name of DISCOVERY_PAIR) expect(names).not.toContain(name);
    expect(pairToolsIn(opts.customTools)).toHaveLength(0);
    // AC-3 at the allowlist level: pair names absent (discoveryTools [] by default).
    for (const name of DISCOVERY_PAIR) expect(opts.tools ?? []).not.toContain(name);
    host.dispose();
  });

  // STC: UT-07 — FR-09: bridge entries override prompt metadata to undefined;
  // existing tools keep the converter's hardcoded 'Workspace orientation'.
  it('UT-07: FR-09 — bridge tools have undefined prompt metadata; existing tools untouched', async () => {
    const host = await ensureSessionHost({
      workspaceRoot: 'C:/ws/sa4e367-s2',
      providerId: 'anthropic',
      apiKey: 'k',
      configuredModelId: 'm',
      mcpBridge: new McpBridge(runningManager()),
    });
    const custom = sessionOpts().customTools ?? [];
    for (const tool of bridgeToolsIn(custom)) {
      expect(tool.promptSnippet).toBeUndefined();
      expect(tool.promptGuidelines).toBeUndefined();
    }
    const workspaceInfo = custom.find((t) => t.name === 'get_workspace_info');
    expect(workspaceInfo?.promptSnippet).toBe('Workspace orientation'); // override is call-site only
    expect(workspaceInfo?.promptGuidelines)
      .toEqual(['Call get_workspace_info first for exploration or review tasks.']);
    host.dispose();
  });

  // STC: IT-03 — type-guard: real McpBridge → 4 tools; undefined/foreign → none.
  it('IT-03: real McpBridge instance → 4 bridge tools; undefined/foreign value → none (fail-safe)', async () => {
    // Case A — real instance passes the instanceof narrow (OI-03).
    const hostA = await ensureSessionHost({
      workspaceRoot: 'C:/ws/sa4e367-it3a', providerId: 'p', apiKey: 'k',
      mcpBridge: new McpBridge(runningManager()),
    });
    expect(bridgeToolsIn(sessionOpts().customTools)).toHaveLength(4);
    hostA.dispose();

    // Case B — undefined bridge: session still created, zero bridge entries.
    clearSessionHostCache();
    mocks.sessionOpts = undefined;
    const hostB = await ensureSessionHost({ workspaceRoot: 'C:/ws/sa4e367-it3b', providerId: 'p', apiKey: 'k' });
    expect(bridgeToolsIn(sessionOpts().customTools)).toHaveLength(0);
    expect(sessionOpts().customTools).toHaveLength(2); // degraded, never crashed (W-1)
    hostB.dispose();

    // Case C — foreign object (not a McpBridge instance): type-guard blocks it.
    clearSessionHostCache();
    mocks.sessionOpts = undefined;
    const hostC = await ensureSessionHost({
      workspaceRoot: 'C:/ws/sa4e367-it3c', providerId: 'p', apiKey: 'k', mcpBridge: {},
    });
    expect(bridgeToolsIn(sessionOpts().customTools)).toHaveLength(0);
    hostC.dispose();
  });
});

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
      workspaceRoot: 'C:/ws/sa4e367-esc', providerId: 'p', apiKey: 'k',
      mcpBridge: new McpBridge(runningManager()),
    });
    // Default (non-escalated) session: allowlist mirrors the loadout — pair absent.
    for (const name of DISCOVERY_PAIR) expect(sessionOpts().tools ?? []).not.toContain(name);
    host.dispose();
  });
});
