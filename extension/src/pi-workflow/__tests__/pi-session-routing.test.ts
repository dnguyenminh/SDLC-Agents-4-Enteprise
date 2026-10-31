/**
 * Session-vs-legacy routing (SA4E-369 UAT root-cause fix).
 * NEW contract: session-first for ALL providers. Keyless LOCAL endpoints
 * (lmstudio/ollama/onnx) take the AgentSession path too — the session host
 * seeds LOCAL_KEYLESS_PLACEHOLDER auth and registers the shared keyless
 * gateway (real /v1/models), which is what makes peer_list/peer_send/
 * peer_status exist in EVERY tab (UG §4). The legacy path remains the
 * fail-safe fallback: any session failure (e.g. the local server lists no
 * models) falls back to legacy, which owns the rich local-endpoint hint.
 * (The pre-fix rule "local → legacy ALWAYS" — and the outdated premise
 * "pi-ai has no builtin provider / ModelRuntime cannot compose auth" — are
 * gone: the extension owns createGatewayProvider and the SDK exposes
 * registerNativeProvider + setRuntimeApiKey.)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createModels } from '@earendil-works/pi-ai';
import type { MutableModels } from '@earendil-works/pi-ai';
import { fauxProvider } from '@earendil-works/pi-ai/providers/faux';
import { PiWorkflowAdapter } from '../pi-workflow-adapter.js';
import type { ChatExtToWebviewMessage } from '../../chat-panel/message-protocol';

const { mockConfigValues, mocks } = vi.hoisted(() => {
  const promptTurn = vi.fn(
    async (
      text: string,
      onToken?: (t: string) => void,
      onToolEvent?: (e: { phase: string; id: string; name: string }) => void
    ) => {
      onToken?.('routed via session');
      onToolEvent?.({ phase: 'start', id: 't-live', name: 'read' });
      return { text: 'routed via session', toolCalls: [], sessionFile: '/s.jsonl' };
    }
  );
  const mocks = {
    promptTurn,
    ensureSessionHost: vi.fn(async () => ({
      promptTurn,
      getSessionFile: () => '/s.jsonl',
      dispose: vi.fn(),
    })),
  };
  return { mockConfigValues: {} as Record<string, unknown>, mocks };
});

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: (k: string, d: unknown) => (k in mockConfigValues ? mockConfigValues[k] : d),
    })),
  },
  window: { createOutputChannel: () => ({ appendLine: vi.fn(), dispose: vi.fn() }) },
}));

vi.mock('../pi-agent-session-host.js', () => ({
  ensureSessionHost: (...args: unknown[]) =>
    (mocks.ensureSessionHost as (...args: unknown[]) => Promise<unknown>)(...args),
  clearSessionHostCache: () => undefined,
}));

function chatErrors(onEvent: ReturnType<typeof vi.fn>) {
  return onEvent.mock.calls
    .map((c: unknown[]) => c[0] as ChatExtToWebviewMessage)
    .filter((m) => (m as { type?: string }).type === 'chat:error');
}

describe('PiWorkflowAdapter session routing (local vs cloud)', () => {
  let models: MutableModels;
  let onEvent: ReturnType<typeof vi.fn>;
  let adapter: PiWorkflowAdapter | undefined;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    for (const k of Object.keys(mockConfigValues)) delete mockConfigValues[k];
    mocks.ensureSessionHost.mockClear();
    mocks.promptTurn.mockClear();
    models = createModels();
    models.setProvider(fauxProvider().provider);
    onEvent = vi.fn();
  });

  afterEach(() => {
    adapter?.dispose();
    adapter = undefined;
    models.deleteProvider('faux');
    delete process.env.NODE_ENV;
  });

  it('lmstudio (keyless local) routes to the SESSION path (peer tools available in every tab)', async () => {
    // SA4E-370: getSetting reads ONLY the new dotted keys post-migration.
    mockConfigValues['llm.provider'] = 'lmstudio';
    mockConfigValues['llm.model'] = '';
    mockConfigValues['llm.profiles'] = [
      { id: 'lmstudio', provider: 'lmstudio', model: 'qwen-7b', useDefaultUrl: true },
    ];
    mockConfigValues['llm.activeProfileId'] = 'lmstudio';
    adapter = new PiWorkflowAdapter({
      mcpManager: { status: 'running' } as never,
      workspaceRoot: 'C:/ws/test',
      onEvent: onEvent as (msg: ChatExtToWebviewMessage) => void,
      models,
    });

    await adapter.invokeChat('hi');

    // SA4E-369 UAT fix: the stale "local → legacy ALWAYS" gate is gone —
    // the session host is created for keyless providers too (this is what
    // registers peer_list/peer_send/peer_status in the tab).
    expect(mocks.ensureSessionHost).toHaveBeenCalledWith(
      expect.objectContaining({ providerId: 'lmstudio' })
    );
    // The turn SUCCEEDS through the mocked session host — no chat errors.
    expect(chatErrors(onEvent)).toEqual([]);
  });

  it('lmstudio session failure falls back to the LEGACY path (fail-safe kept)', async () => {
    // SA4E-370: getSetting reads ONLY the new dotted keys post-migration.
    mockConfigValues['llm.provider'] = 'lmstudio';
    mockConfigValues['llm.model'] = '';
    mockConfigValues['llm.profiles'] = [
      { id: 'lmstudio', provider: 'lmstudio', model: 'qwen-7b', useDefaultUrl: true },
    ];
    mockConfigValues['llm.activeProfileId'] = 'lmstudio';
    // Simulate the session host failing to resolve a model (local server
    // unreachable / lists no models → PI_MODEL_UNRESOLVED from createModelRuntime).
    mocks.ensureSessionHost.mockRejectedValueOnce(
      new Error('PI_MODEL_UNRESOLVED: gateway listed no models')
    );
    adapter = new PiWorkflowAdapter({
      mcpManager: { status: 'running' } as never,
      workspaceRoot: 'C:/ws/test',
      onEvent: onEvent as (msg: ChatExtToWebviewMessage) => void,
      models,
    });

    await adapter.invokeChat('hi');

    // The session was ATTEMPTED (new routing), then the legacy path ran and
    // surfaced ITS OWN error (faux registry has no lmstudio models) — the
    // fail-safe chain is intact: session-first, legacy as the fallback.
    expect(mocks.ensureSessionHost).toHaveBeenCalled();
    const codes = chatErrors(onEvent).map((e) => (e as { code?: string }).code);
    expect(codes).toContain('PI_MODEL_UNRESOLVED');
  });

  it('cloud provider with key routes to the session path', async () => {
    mockConfigValues['llm.provider'] = 'anthropic';
    mockConfigValues['llm.model'] = '';
    mockConfigValues['llm.profiles'] = [
      { id: 'anthropic-claude-3-haiku', provider: 'anthropic', model: 'claude-3-haiku', useDefaultUrl: true },
    ];
    mockConfigValues['llm.activeProfileId'] = 'anthropic-claude-3-haiku';
    const secrets = { get: async () => 'sk-x', store: async () => undefined, delete: async () => undefined };
    adapter = new PiWorkflowAdapter({
      mcpManager: { status: 'running' } as never,
      workspaceRoot: 'C:/ws/test',
      onEvent: onEvent as (msg: ChatExtToWebviewMessage) => void,
      models,
      secrets: secrets as never,
    });

    await adapter.invokeChat('hi');

    expect(mocks.ensureSessionHost).toHaveBeenCalled();
    // SA4E-365: promptTurn now also receives the onThinking callback (F2 wiring).
    expect(mocks.promptTurn).toHaveBeenCalledWith('hi', expect.any(Function), expect.any(Function), expect.any(Function));
    expect(chatErrors(onEvent)).toEqual([]);
    // Live tool progress reaches the webview as a tool block.
    const toolMsgs = onEvent.mock.calls
      .map((c: unknown[]) => c[0] as { type?: string; toolCall?: { name?: string } })
      .filter((m) => m.type === 'chat:toolCall');
    expect(toolMsgs.length).toBe(1);
    expect(toolMsgs[0].toolCall?.name).toBe('read');
    // Streaming identity: tokens and completion share ONE turn streamId.
    const tokenSpy = vi.spyOn(adapter.getStreamHandler(), 'emitToken');
    const completeSpy = vi.spyOn(adapter.getStreamHandler(), 'emitComplete');
    await adapter.invokeChat('second turn');
    const tokenIds = tokenSpy.mock.calls.map((c) => c[2]);
    const completeIds = completeSpy.mock.calls.map((c) => c[2]);
    expect(tokenIds.length).toBeGreaterThan(0);
    expect(completeIds).toHaveLength(1);
    expect(new Set([...tokenIds, ...completeIds]).size).toBe(1);
  });

  it('closes the stream even for textless turns (tool-only output)', async () => {
    mockConfigValues['llm.provider'] = 'anthropic';
    mockConfigValues['llm.model'] = '';
    mockConfigValues['llm.profiles'] = [
      { id: 'anthropic-claude-3-haiku', provider: 'anthropic', model: 'claude-3-haiku', useDefaultUrl: true },
    ];
    mockConfigValues['llm.activeProfileId'] = 'anthropic-claude-3-haiku';
    const secrets = { get: async () => 'sk-x', store: async () => undefined, delete: async () => undefined };
    adapter = new PiWorkflowAdapter({
      mcpManager: { status: 'running' } as never,
      workspaceRoot: 'C:/ws/test',
      onEvent: onEvent as (msg: ChatExtToWebviewMessage) => void,
      models,
      secrets: secrets as never,
    });
    mocks.promptTurn.mockImplementationOnce(async () => ({
      text: '',
      toolCalls: [],
      sessionFile: '/s.jsonl',
    }));
    const completeSpy = vi.spyOn(adapter.getStreamHandler(), 'emitComplete');
    await adapter.invokeChat('do tools');

    expect(completeSpy).toHaveBeenCalledTimes(1);
    expect(chatErrors(onEvent)).toEqual([]);
  });
});

