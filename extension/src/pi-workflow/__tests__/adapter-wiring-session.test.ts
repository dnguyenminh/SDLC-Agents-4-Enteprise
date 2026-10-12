/**
 * SA4E-355 Wave 3 — adapter session wiring (the Wave-2 gap fix).
 * BR-12/STC-309: detectContextWindowEarly() runs BEFORE the session host
 * assembles static context, and the detected window flows into the host.
 * UC-02/UC-04: role + phase from the pipeline state flow into ensureSessionHost.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createModels } from '@earendil-works/pi-ai';
import { fauxProvider } from '@earendil-works/pi-ai/providers/faux';
import { PiWorkflowAdapter } from '../pi-workflow-adapter.js';
import type { ChatExtToWebviewMessage } from '../../chat-panel/message-protocol';

const { mockConfigValues, mocks } = vi.hoisted(() => {
  const promptTurn = vi.fn(
    async (
      _text: string,
      onToken?: (t: string) => void,
      _onToolEvent?: (e: unknown) => void
    ) => {
      onToken?.('session ok');
      return { text: 'session ok', toolCalls: [], sessionFile: '/s.jsonl' };
    }
  );
  return {
    mockConfigValues: {} as Record<string, unknown>,
    mocks: {
      promptTurn,
      detectContextWindow: vi.fn(async () => 32768),
      ensureSessionHost: vi.fn(async () => ({
        promptTurn,
        getSessionFile: () => '/s.jsonl',
        dispose: vi.fn(),
      })),
    },
  };
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

/** Fake LlmProvider exposing eager context-window detection (meta.n_ctx). */
const fakeLlmProvider = {
  type: 'faux',
  chat: async () => '',
  chatStream: async function* () {},
  isAvailable: async () => true,
  dispose: () => undefined,
  getContextWindow: () => 32768,
  detectContextWindow: mocks.detectContextWindow,
} as never;

function chatErrors(onEvent: ReturnType<typeof vi.fn>) {
  return onEvent.mock.calls
    .map((c: unknown[]) => c[0] as ChatExtToWebviewMessage)
    .filter((m) => (m as { type?: string }).type === 'chat:error');
}

const secrets = { get: async () => 'sk-x', store: async () => undefined, delete: async () => undefined };

describe('PiWorkflowAdapter — SA4E-355 wiring (role / phase / nCtxDetected)', () => {
  let models: ReturnType<typeof createModels>;
  let onEvent: ReturnType<typeof vi.fn>;
  let adapter: PiWorkflowAdapter | undefined;

  beforeEach(() => {
    for (const k of Object.keys(mockConfigValues)) delete mockConfigValues[k];
    mockConfigValues.llmProvider = 'anthropic';
    mockConfigValues.llmModel = '';
    mocks.ensureSessionHost.mockClear();
    mocks.ensureSessionHost.mockImplementation(async () => ({
      promptTurn: mocks.promptTurn,
      getSessionFile: () => '/s.jsonl',
      dispose: vi.fn(),
    }));
    mocks.detectContextWindow.mockClear();
    mocks.promptTurn.mockClear();
    models = createModels();
    models.setProvider(fauxProvider().provider);
    onEvent = vi.fn();
  });

  afterEach(() => {
    adapter?.dispose();
    adapter = undefined;
    models.deleteProvider('faux');
  });

  it('passes role + phase + nCtxDetected into ensureSessionHost (UC-02/UC-04/UC-01)', async () => {
    adapter = new PiWorkflowAdapter({
      mcpManager: { status: 'running' } as never,
      workspaceRoot: 'C:/ws/wire',
      onEvent: onEvent as (msg: ChatExtToWebviewMessage) => void,
      models,
      secrets: secrets as never,
      llmProvider: fakeLlmProvider,
    });

    await adapter.invoke('SA4E-355', 'requirements', 'Hãy review source code');

    expect(mocks.ensureSessionHost).toHaveBeenCalledTimes(1);
    expect(mocks.ensureSessionHost).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceRoot: 'C:/ws/wire',
        providerId: 'anthropic',
        role: 'sm-agent', // the executeTurn role now also drives the session path
        phase: 'requirements', // state.currentPhase
        nCtxDetected: 32768, // provider meta.n_ctx (detection result)
      })
    );
  });

  it('STC-309/BR-12: detectContextWindowEarly runs BEFORE the host assembles static context', async () => {
    adapter = new PiWorkflowAdapter({
      mcpManager: { status: 'running' } as never,
      workspaceRoot: 'C:/ws/order',
      onEvent: onEvent as (msg: ChatExtToWebviewMessage) => void,
      models,
      secrets: secrets as never,
      llmProvider: fakeLlmProvider,
    });

    await adapter.invokeChat('review');

    expect(mocks.detectContextWindow).toHaveBeenCalledTimes(1);
    expect(mocks.detectContextWindow.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.ensureSessionHost.mock.invocationCallOrder[0]
    );
  });

  it('no detection available → nCtxDetected is undefined → the host fails open (BR-07 spirit)', async () => {
    adapter = new PiWorkflowAdapter({
      mcpManager: { status: 'running' } as never,
      workspaceRoot: 'C:/ws/nodetect',
      onEvent: onEvent as (msg: ChatExtToWebviewMessage) => void,
      models,
      secrets: secrets as never,
      // no llmProvider — nothing detectable
    });

    await adapter.invokeChat('hi');

    const opts = mocks.ensureSessionHost.mock.calls[0][0] as { nCtxDetected?: number };
    expect(opts.nCtxDetected).toBeUndefined();
    expect(chatErrors(onEvent)).toEqual([]); // turn still completes (fail-open)
  });
});
