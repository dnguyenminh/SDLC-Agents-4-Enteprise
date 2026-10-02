/**
 * Session-vs-legacy routing (UAT: "Provider is not configured: lmstudio").
 * pi-ai has NO builtin lmstudio/ollama provider and ModelRuntime cannot
 * compose auth for them — so local endpoints must ALWAYS take the legacy
 * gateway path, never the AgentSession path.
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
  ensureSessionHost: (...a: unknown[]) =>
    (mocks.ensureSessionHost as (...a: unknown[]) => Promise<unknown>)(...a),
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

  it('lmstudio never touches the session path (legacy gateway owns local endpoints)', async () => {
    mockConfigValues.llmProvider = 'lmstudio';
    mockConfigValues.llmModel = '';
    adapter = new PiWorkflowAdapter({
      mcpManager: { status: 'running' } as never,
      workspaceRoot: 'C:/ws/test',
      onEvent: onEvent as (msg: ChatExtToWebviewMessage) => void,
      models,
    });

    await adapter.invokeChat('hi');

    expect(mocks.ensureSessionHost).not.toHaveBeenCalled();
    // Legacy path ran: faux registry has no lmstudio models → its own error,
    // NOT a session "Provider is not configured" failure.
    const codes = chatErrors(onEvent).map((e) => (e as { code?: string }).code);
    expect(codes).toContain('PI_MODEL_UNRESOLVED');
  });

  it('cloud provider with key routes to the session path', async () => {
    mockConfigValues.llmProvider = 'anthropic';
    mockConfigValues.llmModel = '';
    const secrets = { get: async () => 'sk-x', store: async () => undefined, delete: async () => undefined };
    adapter = new PiWorkflowAdapter({
      mcpManager: { status: 'running' } as never,
      workspaceRoot: 'C:/ws/test',
      onEvent: onEvent as (msg: ChatExtToWebviewMessage) => void,
      models,
      secrets: secrets as never,
    });

    await adapter.invokeChat('hi');

    expect(mocks.ensureSessionHost).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceRoot: 'C:/ws/test', providerId: 'anthropic', apiKey: 'sk-x' })
    );
    expect(mocks.promptTurn).toHaveBeenCalledWith('hi', expect.any(Function), expect.any(Function));
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
    mockConfigValues.llmProvider = 'anthropic';
    mockConfigValues.llmModel = '';
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
