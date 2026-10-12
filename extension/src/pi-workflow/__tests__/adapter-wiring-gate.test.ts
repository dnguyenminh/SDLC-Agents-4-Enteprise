/**
 * SA4E-355 Wave 3 — budget gate rejection at the adapter boundary.
 * UC-05/BR-09: a gate REJECT surfaces the actionable chat:error and NEVER
 * falls back to the legacy path (the provider must not see the oversized prompt).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createModels } from '@earendil-works/pi-ai';
import { fauxProvider } from '@earendil-works/pi-ai/providers/faux';
import { PiWorkflowAdapter } from '../pi-workflow-adapter.js';
import { PiContextBudgetExceededError } from '../../pi-agent/budget-gate.js';
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

function chatErrors(onEvent: ReturnType<typeof vi.fn>) {
  return onEvent.mock.calls
    .map((c: unknown[]) => c[0] as ChatExtToWebviewMessage)
    .filter((m) => (m as { type?: string }).type === 'chat:error');
}

// DEVIATION (test setup fix): the session path requires an API key — without
// secrets the adapter correctly skips to the legacy path and this test can
// never reach the mocked gate rejection. Secrets added so the REJECT flows.
const secrets = { get: async () => 'sk-x', store: async () => undefined, delete: async () => undefined };

describe('PiWorkflowAdapter — budget gate rejection (UC-05 / BR-09)', () => {
  let models: ReturnType<typeof createModels>;
  let onEvent: ReturnType<typeof vi.fn>;
  let adapter: PiWorkflowAdapter | undefined;

  beforeEach(() => {
    for (const k of Object.keys(mockConfigValues)) delete mockConfigValues[k];
    mockConfigValues.llmProvider = 'anthropic';
    mockConfigValues.llmModel = '';
    mocks.ensureSessionHost.mockClear();
    models = createModels();
    models.setProvider(fauxProvider().provider);
    onEvent = vi.fn();
  });

  afterEach(() => {
    adapter?.dispose();
    adapter = undefined;
    models.deleteProvider('faux');
  });

  it('STC-206/STC-307: gate REJECT → actionable chat:error, provider path NEVER invoked', async () => {
    mocks.ensureSessionHost.mockRejectedValueOnce(
      new PiContextBudgetExceededError(48000, 3841, 8192)
    );
    adapter = new PiWorkflowAdapter({
      mcpManager: { status: 'running' } as never,
      workspaceRoot: 'C:/ws/reject',
      onEvent: onEvent as (msg: ChatExtToWebviewMessage) => void,
      models,
      secrets: secrets as never,
    });
    const engine = (
      adapter as unknown as {
        engine: { executeTurn: (...args: unknown[]) => Promise<unknown> };
      }
    ).engine;
    const executeTurnSpy = vi.spyOn(engine, 'executeTurn');

    await adapter.invokeChat('Hãy review source code');

    const errors = chatErrors(onEvent);
    expect(errors).toHaveLength(1); // exactly one error — no legacy-path errors after it
    expect(errors[0]).toMatchObject({
      type: 'chat:error',
      code: 'PI_CONTEXT_BUDGET_EXCEEDED',
      retryable: false,
    });
    expect((errors[0] as { message?: string }).message).toBe(
      'PI_CONTEXT_BUDGET_EXCEEDED: static context 48000 tokens vượt budget 3841 cho model n_ctx=8192. Giảm steering/tools hoặc dùng model context lớn hơn.'
    );
    // BR-09: the turn is claimed — the legacy engine (and thus the provider)
    // is never invoked with the oversized prompt.
    expect(executeTurnSpy).not.toHaveBeenCalled();
  });
});
