/**
 * SA4E-367 — shared mocks + helpers for the SESSION-path bridge suites
 * (bridge-wiring-session.test.ts + bridge-wiring-session-loadout.test.ts).
 * Pattern: mock '@earendil-works/pi-coding-agent' from
 * pi-agent-session-host.test.ts:34-58. The McpBridge is the REAL class from
 * the same module (TDD R-7 — no vi.mock of mcp-bridge; instanceof must match).
 */
import { vi } from 'vitest';

const { mocks } = vi.hoisted(() => {
  const promptCalls: string[] = [];
  let subscribed = 0;
  const mocks = {
    promptCalls,
    setRuntimeApiKey: vi.fn(async (_p: string, _k: string) => undefined),
    // SA4E-369 UAT fix: keyless local providers register the shared gateway
    // provider NATIVELY (real /v1/models) — capture + controllable fetch.
    registerNativeProvider: vi.fn(),
    fetchGatewayModels: vi.fn(async (_baseUrl: string, _authHeader?: string) => [] as unknown[]),
    createGatewayProvider: vi.fn(async () => ({ id: 'gateway-stub' })),
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
      registerNativeProvider: mocks.registerNativeProvider,
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

export { mocks };

export const BRIDGE_TOOL_NAMES = ['jira_get_issue', 'mem_search', 'mem_ingest', 'code_search'] as const;
// SA4E-367: the gated discovery pair — absent by default, routed via
// discoveryTools (never dropped) only when explicitly opted in.
export const DISCOVERY_PAIR = ['find_tools', 'execute_dynamic_tool'] as const;

export type SessionToolDef = {
  name?: string;
  label?: string;
  promptSnippet?: string;
  promptGuidelines?: string[];
  execute?: unknown;
};

export const sessionOpts = (): { customTools?: SessionToolDef[]; tools?: string[] } =>
  mocks.sessionOpts as { customTools?: SessionToolDef[]; tools?: string[] };

export const bridgeToolsIn = (customTools: SessionToolDef[] | undefined): SessionToolDef[] =>
  (customTools ?? []).filter((t) => (BRIDGE_TOOL_NAMES as readonly string[]).includes(t.name ?? ''));

export const pairToolsIn = (customTools: SessionToolDef[] | undefined): SessionToolDef[] =>
  (customTools ?? []).filter((t) => (DISCOVERY_PAIR as readonly string[]).includes(t.name ?? ''));

export const runningManager = () =>
  ({ status: 'running', invokeTool: vi.fn().mockResolvedValue('') }) as never;
