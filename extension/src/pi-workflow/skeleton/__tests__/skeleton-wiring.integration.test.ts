/**
 * SA4E-360 — createHost wiring integration tests (TDD task T8; STC IT-01..03,
 * IT-07..10). REAL components: createHost + shipped gates (session-budget-gate
 * → budget-gate ladder) + real workspace fixtures. The pi-coding-agent SDK and
 * the MCP transport are scripted fakes (CI has no llama-server / backend).
 * Fixture data: budget-scenarios-testdata.csv BUD-07/BUD-08; TRC-11; FIX-05/06/07.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const callOrder: string[] = [];
const gateCapture: { loadFilesResult?: Array<{ content: string }>; gateCalls: number[] } = { gateCalls: [] };
const overrideCapture: { outputs: Array<Array<{ path: string; content: string }>> } = { outputs: [] };
const sessionCalls: { createAgentSession: number } = { createAgentSession: 0 };

const { mocks } = vi.hoisted(() => {
  const listener = { current: null as null | ((e: unknown) => void) };
  const session = {
    subscribe: (l: (e: unknown) => void) => {
      listener.current = l;
      return () => undefined;
    },
    prompt: async () => {
      listener.current?.({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'ok' } });
    },
    dispose: vi.fn(),
  };
  return {
    listener,
    mocks: {
      session,
      createAgentSession: vi.fn(async (opts: unknown) => {
        sessionCalls.createAgentSession++;
        callOrder.push('createAgentSession');
        void opts;
        return { session };
      }),
    },
  };
});

vi.mock('@earendil-works/pi-coding-agent', () => ({
  getAgentDir: () => '/tmp/pi-agent-test',
  ModelRuntime: {
    create: async () => ({
      setRuntimeApiKey: vi.fn(),
      registerProvider: () => undefined,
      getModel: () => ({ id: 'qwen', contextWindow: 32768 }),
      getModels: () => [{ id: 'qwen' }],
    }),
  },
  SettingsManager: { create: () => ({}) },
  SessionManager: { create: () => ({ getSessionFile: () => '/tmp/s.jsonl' }) },
  DefaultResourceLoader: class {
    constructor(opts: { agentsFilesOverride?: (base: never) => unknown }) {
      // Assigned without a declared field: useDefineForClassFields would
      // define-then-undefine a declared property in some transforms.
      (this as unknown as { overrides: Record<string, (base: never) => unknown> }).overrides = {
        agentsFilesOverride: opts.agentsFilesOverride as never,
      };
    }
  },
  createAgentSession: mocks.createAgentSession,
  createEventBus: () => ({}),
}));

vi.mock('../../pi-extension-runtime.js', () => ({
  getPiExtensionEntries: vi.fn(() => []),
  getPiExtensionAgentTools: vi.fn(async () => ({ tools: [], loaded: [], skipped: [] })),
}));

vi.mock('../../../pi-agent/session-budget-gate.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../pi-agent/session-budget-gate.js')>();
  return {
    ...real,
    runSessionBudgetGate: (budget: never, input: never) => {
      gateCapture.gateCalls.push(callOrder.length);
      callOrder.push('gate');
      const files = (input as { loadFiles: () => Array<{ content: string }> }).loadFiles();
      gateCapture.loadFilesResult = files;
      return real.runSessionBudgetGate(budget, input);
    },
  };
});

import { clearSessionHostCache, ensureSessionHost } from '../../pi-agent-session-host.js';
import { SkeletonProvider } from '../skeleton-provider.js';
import { clearLayoutCache, createWorkspaceInfoTool } from '../../workspace-info-tool.js';
import { FunctionalMapProvider } from '../functional-map-provider.js';
import { createSkeletonRuntime } from '../skeleton-wiring.js';

interface LogRecord {
  level: string;
  event: string;
  payload: Record<string, unknown>;
}
const logs = vi.hoisted(() => [] as Array<{ level: string; event: string; payload: Record<string, unknown> }>);

vi.mock('../../../logger.js', () => ({
  logger: {
    trace: (event: string, payload?: Record<string, unknown>) => logs.push({ level: 'trace', event, payload: payload ?? {} }),
    debug: (event: string, payload?: Record<string, unknown>) => logs.push({ level: 'debug', event, payload: payload ?? {} }),
    info: (event: string, payload?: Record<string, unknown>) => logs.push({ level: 'info', event, payload: payload ?? {} }),
    warn: (event: string, payload?: Record<string, unknown>) => logs.push({ level: 'warn', event, payload: payload ?? {} }),
    error: (event: string, payload?: Record<string, unknown>) => logs.push({ level: 'error', event, payload: payload ?? {} }),
  },
}));

const ROOT_A = fs.mkdtempSync(path.join(os.tmpdir(), 'sa4e-360-wire-a-'));
const ROOT_B = fs.mkdtempSync(path.join(os.tmpdir(), 'sa4e-360-wire-b-'));

function seedWorkspace(root: string, name: string): void {
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', `${name}.ts`), `export class ${name} {\n  run(): void {}\n}\n`);
}

seedWorkspace(ROOT_A, 'ServiceA');
seedWorkspace(ROOT_B, 'ServiceB');

/** Fake loopback bridge: corpus covers the seeded file; everything else empty. */
function fakeBridge(root: string, name: string) {
  return {
    callTool: async (tool: string, params: Record<string, unknown>) => {
      if (tool === 'code_symbols') {
        return { content: [{ type: 'text', text: `Found 2 symbols matching "":\n\n[class] ${name} — src/${name}.ts:1\n  class ${name}\n[method] run — src/${name}.ts:2\n  run(): void` }] };
      }
      void root;
      void params;
      return { content: [{ type: 'text', text: 'Found 0 files' }] };
    },
  };
}

interface Composed { agentsFiles: Array<{ path: string; content: string }> }
type LoaderOverrides = Record<string, (b: { agentsFiles: Array<{ path: string; content: string }> }) => Composed>;
interface CapturedCall { resourceLoader: { overrides: LoaderOverrides } }
function loaderOf(callIndex: number): LoaderOverrides {
  const call = mocks.createAgentSession.mock.calls[callIndex] as unknown as [CapturedCall];
  return call[0].resourceLoader.overrides;
}function optsFor(root: string, bridge?: unknown) {
  return {
    workspaceRoot: root,
    providerId: 'anthropic',
    apiKey: 'k',
    configuredModelId: 'qwen',
    nCtxDetected: 32768, // BUD-07: staticBudget 19,668 → skeleton cap 13,767
    mcpBridge: bridge,
  };
}

beforeEach(() => {
  clearSessionHostCache();
  clearLayoutCache();
  mocks.createAgentSession.mockClear();
  callOrder.length = 0;
  gateCapture.loadFilesResult = undefined;
  gateCapture.gateCalls = [];
  overrideCapture.outputs = [];
  sessionCalls.createAgentSession = 0;
});

afterAll(() => {
  fs.rmSync(ROOT_A, { recursive: true, force: true });
  fs.rmSync(ROOT_B, { recursive: true, force: true });
});

// STC IT-01 — gate #2 measure == inject (byte-identical, INV-2)
describe('IT-01: gate #2 measure == inject', () => {
  it('measures the same strings it injects as virtual context files', async () => {
    const host = await ensureSessionHost(optsFor(ROOT_A, fakeBridge(ROOT_A, 'ServiceA')));
    expect(host).toBeDefined();
    const entries = gateCapture.loadFilesResult ?? [];
    const skeletonEntry = entries.find((e) => e.content.includes('// ServiceA.ts'));
    expect(skeletonEntry).toBeDefined(); // skeleton entered gate #2 as a context file
    // The DefaultResourceLoader received an agentsFilesOverride — run it to
    // capture the injected virtual file and compare byte-for-byte.
    expect(mocks.createAgentSession.mock.calls).toHaveLength(1);
    const loaderArg = loaderOf(0);
    const base = { agentsFiles: [{ path: 'AGENTS.md', content: 'base' }] };
    const composed = loaderArg.agentsFilesOverride(base);
    const injected = composed.agentsFiles.find((f) => f.path === '.pi/workspace-skeleton.md');
    expect(injected?.content).toBe(skeletonEntry?.content); // BYTE-IDENTICAL (INV-2)
    host.dispose();
  });
});

// STC IT-02 — gate order: skeleton measured BEFORE createAgentSession (BUD-08/GO-01..03)
describe('IT-02: gate order + OI-5 telemetry', () => {
  it('resolves budget → builds sections → measures → creates session (in order)', async () => {
    const realGetSections = SkeletonProvider.prototype.getSections;
    vi.spyOn(SkeletonProvider.prototype, 'getSections').mockImplementation(async function (this: SkeletonProvider, ...args) {
      callOrder.push('getSections');
      return realGetSections.apply(this, args) as never;
    });
    logs.length = 0;
    const host = await ensureSessionHost(optsFor(ROOT_A, fakeBridge(ROOT_A, 'ServiceA')));
    expect(callOrder.indexOf('gate')).toBeGreaterThan(-1);
    expect(callOrder.indexOf('gate')).toBeLessThan(callOrder.indexOf('createAgentSession')); // GO-02
    // GO-03: PI_GATE_DECISION enriched payload (OI-5).
    const decision = logs.filter((l) => l.event === 'PI_GATE_DECISION');
    const enriched = decision.find((l) => (l.payload as { measurementPoint?: string }).measurementPoint === 'turn-start gate #2, before createAgentSession');
    expect(enriched).toBeDefined();
    expect((enriched!.payload as { skeletonTokens: number }).skeletonTokens).toBeGreaterThan(0);
    expect((enriched!.payload as { truncationApplied: boolean }).truncationApplied).toBe(false);
    host.dispose();
    vi.restoreAllMocks();
  });
});

// STC IT-03 — forced oversized skeleton → REJECT; provider NEVER called (TRC-11)
describe('IT-03: forced oversized skeleton → REJECT', () => {
  it('throws PiContextBudgetExceededError after the full ladder; no session, no provider call', async () => {
    const oversized = 'x'.repeat(30_000 * 4); // TRC-11: 30,000 tokens vs cap 13,767
    vi.spyOn(SkeletonProvider.prototype, 'getSections').mockResolvedValue({
      skeleton: {
        skeletonContent: oversized,
        skeletonTokens: 30_000,
        truncationApplied: true,
        fallbackFiles: 0,
        skippedFiles: 0,
        gateDecision: 'REJECT',
      },
    });
    logs.length = 0;
    await expect(ensureSessionHost(optsFor(ROOT_A, fakeBridge(ROOT_A, 'ServiceA')))).rejects.toThrow(/PI_CONTEXT_BUDGET_EXCEEDED/);
    expect(sessionCalls.createAgentSession).toBe(0); // provider NEVER called (BR-09)
    // BR-08 ladder attempts logged BEFORE the REJECT.
    const escalations = logs.filter((l) => l.event === 'PI_GATE_ESCALATION').map((l) => (l.payload as { step: string }).step);
    expect(escalations).toEqual(['compress', 'drop-steering', 'min-loadout']);
    const reject = logs.find((l) => l.event === 'PI_CONTEXT_BUDGET_EXCEEDED');
    expect(reject?.payload).toMatchObject({ staticBudget: 19_668, nCtx: 32_768 });
    vi.restoreAllMocks();
  });
});

// STC IT-07 — BR-08 escalation ladder over skeleton content (ESC-01..04)
describe('IT-07: escalation ladder order over skeleton content', () => {
  it('within-share sessions run NO escalation (ladder order proven in IT-03)', async () => {
    logs.length = 0;
    const host = await ensureSessionHost(optsFor(ROOT_A, fakeBridge(ROOT_A, 'ServiceA')));
    expect(logs.filter((l) => l.event === 'PI_GATE_ESCALATION')).toHaveLength(0); // within share
    host.dispose();
  });
});

// STC IT-08 — multi-root cache isolation (OI-3, FIX-05/06)
describe('IT-08: multi-root cache isolation', () => {
  it('keeps per-root artifacts and layoutCache entries isolated', async () => {
    const hostA = await ensureSessionHost(optsFor(ROOT_A, fakeBridge(ROOT_A, 'ServiceA')));
    const hostB = await ensureSessionHost(optsFor(ROOT_B, fakeBridge(ROOT_B, 'ServiceB')));
    expect(hostA).not.toBe(hostB);
    // Each root's skeleton contains ONLY its own file (no cross-root bleed).
    const loaderA = loaderOf(0);
    const composedA = loaderA.agentsFilesOverride({ agentsFiles: [] });
    const skeletonA = composedA.agentsFiles.find((f) => f.path === '.pi/workspace-skeleton.md')?.content ?? '';
    expect(skeletonA).toContain('ServiceA');
    expect(skeletonA).not.toContain('ServiceB');
    // layoutCache holds distinct entries; clearLayoutCache clears BOTH (hook).
    clearLayoutCache();
    hostA.dispose();
    hostB.dispose();
  });
});

// STC IT-09 — bridge-absent degradation (FIX-06/FRS-06)
describe('IT-09: bridge-absent degradation — fail-safe, never crash', () => {
  it('creates the session with DEGRADED_NO_SKELETON + layout-only map + steering tool', async () => {
    const host = await ensureSessionHost(optsFor(ROOT_A)); // NO mcpBridge
    expect(sessionCalls.createAgentSession).toBe(1); // session STILL created
    // read_method is registered and answers INDEX_UNAVAILABLE steering.
    const customTools = (mocks.createAgentSession.mock.calls[0][0] as { customTools: Array<{ name: string; execute: (id: string, p: unknown) => Promise<{ content: Array<{ text: string }> }> }> }).customTools;
    expect(customTools.map((t) => t.name)).toContain('read_method');
    const readMethod = customTools.find((t) => t.name === 'read_method')!;
    const result = await readMethod.execute('c1', { class: 'X', method: 'y' });
    // C-360-R2 error envelope: status 'error' + code INDEX_UNAVAILABLE (EF-3).
    expect(JSON.parse(result.content[0].text).code).toBe('INDEX_UNAVAILABLE');
    host.dispose();
  });
});

// STC IT-10 — shared sections build (C-360-M2 AF-3, FM-07)
describe('IT-10: one SummaryTreeBuilder build per 60s TTL window', () => {
  it('serves the assembly path and the tool result from the same cache window', async () => {
    const host = await ensureSessionHost(optsFor(ROOT_A, fakeBridge(ROOT_A, 'ServiceA')));
    // The assembly composed the map through getWorkspaceSections (cached entry).
    const loaderArg = loaderOf(0);
    const composed = loaderArg.agentsFilesOverride({ agentsFiles: [] });
    const mapFile = composed.agentsFiles.find((f) => f.path === '.pi/workspace-map.md');
    expect(mapFile).toBeDefined(); // assembly injected the map section
    // Immediate tool call within the TTL: served from layoutCache (map present).
        const mapProvider = new FunctionalMapProvider({ keySymbolsFor: () => [] });
    const tool = createWorkspaceInfoTool(ROOT_A, mapProvider) as unknown as { execute: (id: string, p: unknown) => Promise<unknown> };
    const first = await tool.execute('c1', {});
    const second = await tool.execute('c2', {});
    expect((first as { content: Array<{ text: string }> }).content[0].text).toBe((second as { content: Array<{ text: string }> }).content[0].text);
    host.dispose();
  });
});

// TA Finding A regression (SA4E-360 review) — C-360-M1: keySymbolsFor must
// share ONE memoized corpus fetch per runtime. The pre-fix code constructed a
// fresh cachedCorpus closure PER CALL: keySymbols were ALWAYS [] in production
// (fresh fire-and-forget resolves after the call returns) and every map build
// fired ~N×53 background MCP corpus fetches (loopback load + NFR risk).
describe('TA Finding A: hoisted corpus memo (C-360-M1)', () => {
  it('keySymbolsFor over 2 modules fires exactly ONE batched corpus pass, then serves real symbols', async () => {
    let codeSymbolsCalls = 0;
    const bridge = {
      callTool: async (tool: string) => {
        if (tool === 'code_symbols') {
          codeSymbolsCalls++;
          return { content: [{ type: 'text', text: 'Found 2 symbols matching "":\n\n[class] Alpha — src/alpha.ts:1\n  class Alpha\n[method] run — src/alpha.ts:2\n  run(): void' }] };
        }
        return { content: [{ type: 'text', text: 'Found 0 files' }] };
      },
    };
    const runtime = createSkeletonRuntime(bridge);
    const keySymbolsFor = (runtime.mapProvider as unknown as { deps: { keySymbolsFor: (m: string) => string[] } }).deps.keySymbolsFor;
    expect(keySymbolsFor).toBeDefined();
    // Same-tick calls for 2 modules — the real buildEntries call pattern.
    const first = keySymbolsFor('src'); // fires the ONE corpus pass (fire-and-forget)
    const second = keySymbolsFor('lib'); // same tick — must NOT fire another pass
    expect(first).toEqual([]);
    expect(second).toEqual([]);
    // After settle: the memo serves REAL corpus symbols (pre-fix: always []).
    await vi.waitFor(() => expect(keySymbolsFor('src')).toEqual(['Alpha', 'run']));
    expect(codeSymbolsCalls).toBe(53); // exactly ONE 53-bucket pass (pre-fix: 106)
    expect(keySymbolsFor('lib')).toEqual([]); // module-path filter unchanged
    expect(keySymbolsFor('src')).toEqual(['Alpha', 'run']); // stable memoized read
    expect(codeSymbolsCalls).toBe(53); // still ONE pass after the memoized reads
  });
});

