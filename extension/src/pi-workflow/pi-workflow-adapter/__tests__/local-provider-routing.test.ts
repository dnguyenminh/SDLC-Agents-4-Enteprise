/**
 * SA4E-369 UAT root-cause fix — session-first routing for keyless LOCAL
 * providers. Before the fix trySessionTurn early-returned false for
 * lmstudio/ollama/onnx ("local → legacy gateway path"), so createHost /
 * wirePeerSession never ran and the peer tools never existed in the user's
 * SDLC CHAT tab. After the fix ONLY key-requiring providers without a key
 * fall back to legacy; local providers proceed into the session path.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { routingMocks } = vi.hoisted(() => {
  const routingMocks = {
    readProviderTurnConfig: vi.fn(),
    ensureSessionHost: vi.fn(),
  };
  return { routingMocks };
});

// Partial bridge mock: keep the REAL providerRequiresApiKey etc., override
// ONLY the settings read (the turn-config source of truth).
vi.mock('../../pi-provider-config-bridge.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../pi-provider-config-bridge.js')>();
  return {
    ...actual,
    readProviderTurnConfig: (...args: unknown[]) => routingMocks.readProviderTurnConfig(...args),
  };
});

vi.mock('../../pi-agent-session-host.js', () => ({
  ensureSessionHost: (...args: unknown[]) => routingMocks.ensureSessionHost(...args),
  evictSessionHost: vi.fn(),
  clearSessionHostCache: vi.fn(),
}));

vi.mock('vscode', () => ({}));
vi.mock('../../../debug-logger', () => ({ debugLog: vi.fn(), debugError: vi.fn() }));

import { AdapterLegacyTurns } from '../adapter-legacy-turns.js';

/**
 * Builds a bare adapter WITHOUT the real constructor (which spins MCP/skeleton
 * side effects irrelevant here). trySessionTurn only touches the stubbed
 * fields below; detectContextWindowEarly/getDetectedContextWindow are real
 * prototype methods driven by llmProvider (undefined → instant no-probe).
 */
function makeAdapter() {
  const onEvent = vi.fn();
  const adapter = Object.create(AdapterLegacyTurns.prototype) as Record<string, unknown>;
  adapter.onEvent = onEvent;
  adapter.workspaceRoot = '/ws';
  adapter.secrets = undefined;
  adapter.llmProvider = undefined;
  adapter.contextProbeState = { probeDone: false };
  adapter.mcpBridge = {};
  adapter.streamHandler = {
    emitToken: vi.fn(),
    emitThinking: vi.fn(),
    emitComplete: vi.fn(),
    emitError: vi.fn(),
  };
  adapter.store = {
    activeTab: 'tab-uat',
    getHistory: () => [],
    setHistory: vi.fn(),
    save: vi.fn(),
  };
  return adapter;
}

function turnArgs() {
  return [
    { currentPhase: undefined } as never, // state
    'call peer_list and show me the peers', // chatInput
    'TICKET', // ticketKey
    'sm-agent', // role
    0, // timeoutMs (no wall-clock backstop)
    'stream-1', // turnStreamId
  ] as const;
}

describe('trySessionTurn — SA4E-369 local-provider routing fix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routingMocks.ensureSessionHost.mockResolvedValue({
      promptTurn: vi.fn(async () => ({ text: 'peers: [...]', toolCalls: [] })),
    });
  });

  it('ROUTE-01: lmstudio (keyless) PROCEEDS into the session path (pre-fix: early return false)', async () => {
    routingMocks.readProviderTurnConfig.mockReturnValue({
      providerId: 'lmstudio',
      baseUrl: 'http://localhost:1234/v1',
      configuredModelId: '',
      fallbackModelIds: [],
    });

    const adapter = makeAdapter();
    const handled = await (adapter as unknown as {
      trySessionTurn: (...a: unknown[]) => Promise<boolean>;
    }).trySessionTurn(...turnArgs());

    expect(handled).toBe(true);
    expect(routingMocks.ensureSessionHost).toHaveBeenCalledTimes(1);
    expect(routingMocks.ensureSessionHost).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: 'lmstudio',
        baseUrl: 'http://localhost:1234/v1',
        tabId: 'tab-uat',
      })
    );
  });

  it('ROUTE-02: anthropic with a key → session path (unchanged cloud behavior)', async () => {
    routingMocks.readProviderTurnConfig.mockReturnValue({
      providerId: 'anthropic',
      baseUrl: undefined,
      configuredModelId: 'claude-sonnet-4',
      fallbackModelIds: [],
    });
    // Route through a REAL credential resolver stub — adapter.secrets undefined
    // would return false pre-check; give the adapter a secrets-backed resolver.
    const adapter = makeAdapter();
    (adapter as unknown as { secrets: unknown }).secrets = {
      get: vi.fn(async () => 'sk-ant'),
      store: vi.fn(),
      delete: vi.fn(),
    } as never;

    const handled = await (adapter as unknown as {
      trySessionTurn: (...a: unknown[]) => Promise<boolean>;
    }).trySessionTurn(...turnArgs());

    expect(handled).toBe(true);
    expect(routingMocks.ensureSessionHost).toHaveBeenCalledWith(
      expect.objectContaining({ providerId: 'anthropic', baseUrl: undefined })
    );
  });

  it('ROUTE-03: anthropic WITHOUT a key → still falls back to legacy (fail-closed kept)', async () => {
    routingMocks.readProviderTurnConfig.mockReturnValue({
      providerId: 'anthropic',
      baseUrl: undefined,
      configuredModelId: '',
      fallbackModelIds: [],
    });

    const adapter = makeAdapter(); // secrets undefined → no key
    const handled = await (adapter as unknown as {
      trySessionTurn: (...a: unknown[]) => Promise<boolean>;
    }).trySessionTurn(...turnArgs());

    expect(handled).toBe(false);
    expect(routingMocks.ensureSessionHost).not.toHaveBeenCalled();
  });
});
