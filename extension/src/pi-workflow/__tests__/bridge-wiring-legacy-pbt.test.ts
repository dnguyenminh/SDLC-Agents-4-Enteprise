/**
 * SA4E-367 — bridge tools in the LEGACY tool pool: property test.
 *
 * STC: PBT-02 — property: the bridge merge NEVER overwrites an existing
 * entry — BR-06/OI-06 (bridge tools only fill names not already present).
 * Pattern: engineSpy from adapter-legacy-governance.test.ts:77-83; faux
 * provider (keyless) drives the LEGACY path (session-first skips providers).
 * UT-04/UT-05/AC-2/AC-3 live in bridge-wiring-legacy-tools.test.ts.
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
    mockConfigValues['llm.provider'] = 'faux';
    mockConfigValues['llm.model'] = 'faux-1';
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
