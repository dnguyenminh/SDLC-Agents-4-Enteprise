/**
 * SA4E-367 — bridge tools wired into the LEGACY tool pool (pi-workflow-adapter).
 * Ported from SA4E-364 (commit 180b150) + SA4E-367 pair-absent asserts:
 * default wiring passes NO options ⇒ 4 concrete tools, discovery pair absent.
 *
 * STC: UT-04 (merge skip-if-exists — ext wins on collision), UT-05 (ext runtime
 * fail → bridge still merged), PBT-02 (property: the bridge merge NEVER
 * overwrites an existing entry — BR-06/OI-06).
 * Pattern: engineSpy from adapter-legacy-governance.test.ts:77-83; faux provider
 * (keyless) drives the LEGACY path (session-first skips local providers).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import { createModels } from '@earendil-works/pi-ai';
import { fauxProvider } from '@earendil-works/pi-ai/providers/faux';
import { PiWorkflowAdapter } from '../pi-workflow-adapter.js';
import type { PipelineState } from '../types/pi-workflow-state.js';
import type { ChatExtToWebviewMessage } from '../../chat-panel/message-protocol';

const { mockConfigValues, debugLogMock } = vi.hoisted(() => ({
  mockConfigValues: {} as Record<string, unknown>,
  debugLogMock: vi.fn(),
}));

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: (k: string, d: unknown) => (k in mockConfigValues ? mockConfigValues[k] : d),
    })),
  },
  window: { createOutputChannel: () => ({ appendLine: vi.fn(), dispose: vi.fn() }) },
}));

// Capture the BR-06 skip warn without losing the other logger exports.
vi.mock('../../debug-logger', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  debugLog: debugLogMock,
}));

vi.mock('../pi-extension-runtime.js', () => ({
  getPiExtensionEntries: vi.fn(() => []),
  getPiExtensionAgentTools: vi.fn(async () => ({ tools: [] as unknown[], loaded: [], skipped: [] })),
}));

// Cheap, deterministic builtin pool so every merge run stays pure in-memory.
vi.mock('../pi-coding-tools.js', () => ({
  buildWorkspaceSystemPrompt: vi.fn(() => 'SA4E-367 test workspace prompt'),
  createWorkspaceTools: vi.fn(async () => [] as unknown[]),
}));

import { getPiExtensionAgentTools } from '../pi-extension-runtime.js';

const BRIDGE_TOOL_NAMES = ['jira_get_issue', 'mem_search', 'mem_ingest', 'code_search'] as const;
// SA4E-367: the gated discovery pair is NEVER in the default legacy pool.
const DISCOVERY_PAIR = ['find_tools', 'execute_dynamic_tool'] as const;

type ToolLike = { name?: unknown; marker?: string; label?: unknown };

function chatErrors(onEvent: ReturnType<typeof vi.fn>): ChatExtToWebviewMessage[] {
  return onEvent.mock.calls
    .map((c: unknown[]) => c[0] as ChatExtToWebviewMessage)
    .filter((m) => (m as { type?: string }).type === 'chat:error');
}

describe('PiWorkflowAdapter — SA4E-367 bridge tools in the LEGACY pool', () => {
  let models: ReturnType<typeof createModels>;
  let onEvent: ReturnType<typeof vi.fn>;
  let adapter: PiWorkflowAdapter | undefined;

  beforeEach(() => {
    for (const k of Object.keys(mockConfigValues)) delete mockConfigValues[k];
    // faux resolves through configurePiProvider; key-requiring + no secrets → LEGACY path.
    mockConfigValues.llmProvider = 'faux';
    mockConfigValues.llmModel = 'faux-1';
    models = createModels();
    models.setProvider(fauxProvider().provider);
    onEvent = vi.fn();
    debugLogMock.mockClear();
    vi.mocked(getPiExtensionAgentTools).mockReset();
    vi.mocked(getPiExtensionAgentTools).mockImplementation(async () => ({
      tools: [], loaded: [], skipped: [],
    }));
  });

  afterEach(() => {
    adapter?.dispose();
    adapter = undefined;
    models.deleteProvider('faux');
  });

  const makeAdapter = (): PiWorkflowAdapter =>
    new PiWorkflowAdapter({
      mcpManager: { status: 'running' } as never,
      workspaceRoot: 'C:/ws/sa4e367-legacy',
      onEvent: onEvent as (msg: ChatExtToWebviewMessage) => void,
      models,
    });

  /** engineSpy — capture the tools array handed to engine.executeTurn (input.options.tools). */
  const engineSpy = (a: PiWorkflowAdapter) =>
    vi.spyOn(
      (a as unknown as { engine: { executeTurn: (...args: unknown[]) => Promise<unknown> } }).engine,
      'executeTurn',
    ).mockResolvedValue({
      result: { ticketKey: 'KEY-367', sessionId: '', agentId: 'sm-agent', messages: [], toolCalls: [], streamChunks: [] },
      nextState: { ticketKey: 'KEY-367', threadId: '', currentPhase: '', chatHistory: [] } as PipelineState,
    });

  const lastTools = (spy: ReturnType<typeof engineSpy>): ToolLike[] => {
    const last = spy.mock.calls[spy.mock.calls.length - 1];
    return ((last?.[3] as { tools?: unknown[] })?.tools ?? []) as ToolLike[];
  };

  // STC: UT-04 — 4 bridge names merged; name collision → ext sentinel wins + warn.
  it('UT-04: merges bridge tools; collision with an ext tool → existing entry wins + warn (BR-06/OI-06)', async () => {
    const extMemSearch = { name: 'mem_search', marker: 'ext-sentinel' };
    const extAft = { name: 'aft_hoist_tool', marker: 'ext-sentinel' };
    vi.mocked(getPiExtensionAgentTools).mockImplementation(async () => ({
      tools: [extMemSearch, extAft], loaded: ['ext'], skipped: [],
    }));
    adapter = makeAdapter();
    const spy = engineSpy(adapter);

    await adapter.invoke('KEY-367A', 'requirements', 'hello bridge');

    expect(chatErrors(onEvent)).toEqual([]); // the turn itself is unaffected
    const tools = lastTools(spy);
    const names = tools.map((t) => t.name as string);
    // 3 bridge names (mem_search skipped) + both ext tools are in the pool.
    expect(names).toEqual(expect.arrayContaining([
      'jira_get_issue', 'mem_ingest', 'code_search', 'aft_hoist_tool', 'mem_search',
    ]));
    // Collision: exactly ONE mem_search and it is the EXT sentinel — the bridge
    // merge did NOT overwrite (skip-if-exists, OI-06 — different from last-wins).
    expect(tools.filter((t) => t.name === 'mem_search')).toHaveLength(1);
    expect(tools.find((t) => t.name === 'mem_search')).toBe(extMemSearch);
    // AFT hoist untouched (reference preserved — BR-06).
    expect(tools.find((t) => t.name === 'aft_hoist_tool')).toBe(extAft);
    // AC-3 on the real pool: the discovery pair is never wired by default (OI-04).
    for (const name of DISCOVERY_PAIR) expect(names).not.toContain(name);
    // Skip warn logged (BR-06).
    expect(debugLogMock).toHaveBeenCalledWith('[PiWorkflowAdapter] bridge tool skipped (exists): mem_search');
  });

  // STC: UT-05 — extension runtime failure → bridge tools still merged (AF-2 UC-01).
  it('UT-05: extension runtime failure → bridge tools still merged, turn survives', async () => {
    vi.mocked(getPiExtensionAgentTools).mockRejectedValue(new Error('extension runtime fail'));
    adapter = makeAdapter();
    const spy = engineSpy(adapter);

    await adapter.invoke('KEY-367B', 'requirements', 'hello bridge');

    expect(chatErrors(onEvent)).toEqual([]); // ext failure is caught (adapter try/catch)
    const names = lastTools(spy).map((t) => t.name as string);
    for (const name of BRIDGE_TOOL_NAMES) expect(names).toContain(name); // bridge merged independently
    expect(names).not.toContain('aft_hoist_tool'); // no ext tools survived
    for (const name of DISCOVERY_PAIR) expect(names).not.toContain(name);
  });

  // SA4E-367 AC-2/AC-3: default legacy pool carries exactly the 4 concrete
  // bridge tools — the pair is absent (wiring passes no options).
  it('AC-2/AC-3: default pool carries the 4 concrete bridge tools; pair absent', async () => {
    adapter = makeAdapter();
    const spy = engineSpy(adapter);

    await adapter.invoke('KEY-367C', 'requirements', 'hello bridge');

    expect(chatErrors(onEvent)).toEqual([]);
    const names = lastTools(spy).map((t) => t.name as string);
    for (const name of BRIDGE_TOOL_NAMES) expect(names).toContain(name);
    for (const name of DISCOVERY_PAIR) expect(names).not.toContain(name);
  });

  // STC: PBT-02 — property: the bridge merge NEVER overwrites an existing entry;
  // bridge tools only fill names not already present; warn for every skipped name.
  it('PBT-02: property — merge is skip-if-exists (existing references preserved, no duplicates)', async () => {
    adapter = makeAdapter();
    const spy = engineSpy(adapter);
    let run = 0;
    const poolNameArb = fc.uniqueArray(
      fc.constantFrom(...BRIDGE_TOOL_NAMES, ...DISCOVERY_PAIR, 'ext_tool_a', 'ext_tool_b', 'ext_tool_c'),
      { maxLength: 7 },
    );
    await fc.assert(
      fc.asyncProperty(poolNameArb, async (poolNames) => {
        const sentinels = new Map(poolNames.map((name) => [name, { name, marker: `sentinel-${run}` }]));
        vi.mocked(getPiExtensionAgentTools).mockImplementation(async () => ({
          tools: [...sentinels.values()],
          loaded: poolNames.length > 0 ? ['ext'] : [],
          skipped: [],
        }));
        debugLogMock.mockClear();
        spy.mockClear();
        await adapter!.invoke(`KEY-367-PBT-${run++}`, 'requirements', 'pbt run');
        expect(chatErrors(onEvent)).toEqual([]);
        const tools = lastTools(spy);
        const byName = new Map(tools.map((t) => [t.name as string, t]));
        // 1. Every pre-existing entry keeps its sentinel reference (never overwritten).
        for (const [name, sentinel] of sentinels) expect(byName.get(name)).toBe(sentinel);
        // 2. Bridge tools only fill names NOT already in the pool.
        const bridgeAdded = BRIDGE_TOOL_NAMES.filter((n) => !poolNames.includes(n));
        for (const name of bridgeAdded) {
          const entry = byName.get(name) as { marker?: string; label?: unknown } | undefined;
          expect(entry).toBeDefined();
          expect(entry?.marker).toBeUndefined(); // bridge shape — not a sentinel
          expect(typeof entry?.label).toBe('string');
        }
        // 3. No duplicates in the merged pool.
        expect(tools.length).toBe(new Set(tools.map((t) => t.name)).size);
        // 4. Every collided name produced exactly the BR-06 skip warn.
        for (const name of poolNames.filter((n) => (BRIDGE_TOOL_NAMES as readonly string[]).includes(n))) {
          expect(debugLogMock).toHaveBeenCalledWith(`[PiWorkflowAdapter] bridge tool skipped (exists): ${name}`);
        }
        // 5. SA4E-367: the pair is never added by the default merge — a
        // pre-existing pair-named ext entry keeps its sentinel (case 1), and
        // no bridge-built pair entry appears.
        for (const name of DISCOVERY_PAIR) {
          const entry = byName.get(name) as { marker?: string } | undefined;
          if (poolNames.includes(name)) expect(entry?.marker).toContain('sentinel-');
          else expect(entry).toBeUndefined();
        }
      }),
      { numRuns: 40 },
    );
  });
});
