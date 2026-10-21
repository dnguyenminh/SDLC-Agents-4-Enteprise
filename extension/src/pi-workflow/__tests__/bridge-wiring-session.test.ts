/**
 * SA4E-367 — bridge tools wired into the SESSION path (PiAgentSessionHost).
 * Ported from SA4E-364 (commit 180b150) + SA4E-367 pair-routing cases:
 * default host passes NO options ⇒ discoveryTools [] (pair absent); opted-in
 * pair survives the role filter via discoveryTools (never dropped).
 *
 * STC: UT-06 (customTools + allowlist), UT-07 (FR-09 prompt metadata override),
 * IT-03 (instanceof type-guard — real instance → 4 tools; absent/foreign → []).
 * Loadout governance (UT-08/09/10) + discovery routing live in
 * bridge-wiring-session-loadout.test.ts (shared mocks: bridge-wiring-session-mocks.ts).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ensureSessionHost, clearSessionHostCache } from '../pi-agent-session-host.js';
import { McpBridge } from '../../mcp/mcp-bridge';
import {
  BRIDGE_TOOL_NAMES,
  DISCOVERY_PAIR,
  bridgeToolsIn,
  pairToolsIn,
  runningManager,
  sessionOpts,
  mocks,
} from './bridge-wiring-session-mocks.js';

describe('PiAgentSessionHost — SA4E-367 bridge tools in the SESSION path', () => {
  beforeEach(() => {
    clearSessionHostCache();
    mocks.promptCalls.length = 0;
    mocks.sessionOpts = undefined;
  });

  // STC: UT-06 — customTools: 2 existing + 4 bridge; allowlist contains the 4 names.
  it('UT-06: customTools carry 2 existing + 4 bridge tools; allowlist includes bridge names', async () => {
    const host = await ensureSessionHost({
      tabId: 'tab-s1',
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
      tabId: 'tab-s2',
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
      tabId: 'tab-it3a',
      workspaceRoot: 'C:/ws/sa4e367-it3a', providerId: 'p', apiKey: 'k',
      mcpBridge: new McpBridge(runningManager()),
    });
    expect(bridgeToolsIn(sessionOpts().customTools)).toHaveLength(4);
    hostA.dispose();

    // Case B — undefined bridge: session still created, zero bridge entries.
    clearSessionHostCache();
    mocks.sessionOpts = undefined;
    const hostB = await ensureSessionHost({ tabId: 'tab-it3b', workspaceRoot: 'C:/ws/sa4e367-it3b', providerId: 'p', apiKey: 'k' });
    expect(bridgeToolsIn(sessionOpts().customTools)).toHaveLength(0);
    // SA4E-369 D4 + SA4E-370 D1: peer_list/peer_send/peer_status now auto-register
    // in every tab (3 peer tools + get_workspace_info + read_method = 5).
    expect(sessionOpts().customTools).toHaveLength(5); // degraded, never crashed (W-1)
    hostB.dispose();

    // Case C — foreign object (not a McpBridge instance): type-guard blocks it.
    clearSessionHostCache();
    mocks.sessionOpts = undefined;
    const hostC = await ensureSessionHost({
      tabId: 'tab-it3c',
      workspaceRoot: 'C:/ws/sa4e367-it3c', providerId: 'p', apiKey: 'k', mcpBridge: {},
    });
    expect(bridgeToolsIn(sessionOpts().customTools)).toHaveLength(0);
    hostC.dispose();
  });
});
