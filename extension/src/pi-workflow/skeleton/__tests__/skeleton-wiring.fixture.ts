/**
 * SA4E-360 — shared fixture for the createHost wiring integration tests
 * (TDD task T8): scripted pi-coding-agent SDK + MCP transport fakes (CI has
 * no llama-server / backend), budget-gate capture, logger capture, two seeded
 * temp workspaces. REAL components: createHost + shipped gates + fixtures.
 * Fixture data: budget-scenarios-testdata.csv BUD-07/BUD-08; TRC-11; FIX-05/06/07.
 */
import { vi, beforeEach, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { clearSessionHostCache } from '../../pi-agent-session-host.js';
import { clearLayoutCache } from '../../workspace-info-tool.js';

export const callOrder: string[] = [];
export const gateCapture: { loadFilesResult?: Array<{ content: string }>; gateCalls: number[] } = { gateCalls: [] };
export const overrideCapture: { outputs: Array<Array<{ path: string; content: string }>> } = { outputs: [] };
export const sessionCalls: { createAgentSession: number } = { createAgentSession: 0 };

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

const logs = vi.hoisted(() => [] as Array<{ level: string; event: string; payload: Record<string, unknown> }>);

export { logs };

vi.mock('../../../logger.js', () => ({
  logger: {
    trace: (event: string, payload?: Record<string, unknown>) => logs.push({ level: 'trace', event, payload: payload ?? {} }),
    debug: (event: string, payload?: Record<string, unknown>) => logs.push({ level: 'debug', event, payload: payload ?? {} }),
    info: (event: string, payload?: Record<string, unknown>) => logs.push({ level: 'info', event, payload: payload ?? {} }),
    warn: (event: string, payload?: Record<string, unknown>) => logs.push({ level: 'warn', event, payload: payload ?? {} }),
    error: (event: string, payload?: Record<string, unknown>) => logs.push({ level: 'error', event, payload: payload ?? {} }),
  },
}));

export { mocks };

export const ROOT_A = fs.mkdtempSync(path.join(os.tmpdir(), 'sa4e-360-wire-a-'));
export const ROOT_B = fs.mkdtempSync(path.join(os.tmpdir(), 'sa4e-360-wire-b-'));

function seedWorkspace(root: string, name: string): void {
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', `${name}.ts`), `export class ${name} {\n  run(): void {}\n}\n`);
}

seedWorkspace(ROOT_A, 'ServiceA');
seedWorkspace(ROOT_B, 'ServiceB');

/** Fake loopback bridge: corpus covers the seeded file; everything else empty. */
export function fakeBridge(root: string, name: string) {
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

export function loaderOf(callIndex: number): LoaderOverrides {
  const call = mocks.createAgentSession.mock.calls[callIndex] as unknown as [CapturedCall];
  return call[0].resourceLoader.overrides;
}

export function optsFor(root: string, bridge?: unknown) {
  return {
    tabId: 'tab-1', // SA4E-370 D1: per-tab session keys require a real tabId
    workspaceRoot: root,
    providerId: 'anthropic',
    apiKey: 'k',
    configuredModelId: 'qwen',
    nCtxDetected: 32768, // BUD-07: staticBudget 19,668 → skeleton cap 13,767
    mcpBridge: bridge,
  };
}

/** Registers the per-file hooks (call once per test file). */
export function setupSkeletonWiringFixture(): void {
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
}
