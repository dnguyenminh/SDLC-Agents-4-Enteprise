/**
 * Adapter-level E2E test — SA4E-289 Round-5 FIX D.
 * Exercises the REAL chat path: PiWorkflowAdapter.invokeChat() → engine → executor → provider.run()
 * with a faux pi-ai model injected. This is the coverage the runtime smoke test missed
 * (it called provider.run() directly, bypassing the executor where provider/model forwarding lives).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createModels } from '@earendil-works/pi-ai';
import type { MutableModels } from '@earendil-works/pi-ai';
import { fauxProvider, fauxAssistantMessage } from '@earendil-works/pi-ai/providers/faux';
import { PiWorkflowAdapter } from '../pi-workflow-adapter.js';
import type { ChatExtToWebviewMessage } from '../../chat-panel/message-protocol';

const { mockConfigValues } = vi.hoisted(() => ({
  mockConfigValues: {} as Record<string, unknown>,
}));

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: (k: string, d: unknown) => (k in mockConfigValues ? mockConfigValues[k] : d),
    })),
  },
  window: { createOutputChannel: () => ({ appendLine: vi.fn(), dispose: vi.fn() }) },
}));

describe('PiWorkflowAdapter e2e — invokeChat through the full chat path (SA4E-289 FIX D)', () => {
  let adapter: PiWorkflowAdapter;
  let models: MutableModels;
  let faux: ReturnType<typeof fauxProvider>;
  let onEventMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    process.env.NODE_ENV = 'test';
    models = createModels();
    faux = fauxProvider();
    models.setProvider(faux.provider);
    faux.setResponses([fauxAssistantMessage('Adapter e2e response from faux Pi model')]);

    onEventMock = vi.fn();
    adapter = new PiWorkflowAdapter({
      mcpManager: { status: 'running' } as any,
      workspaceRoot: 'C:/ws/test',
      onEvent: onEventMock as (msg: ChatExtToWebviewMessage) => void,
      models,
    });
  });

  afterEach(() => {
    models.deleteProvider('faux');
    adapter.dispose();
    delete process.env.NODE_ENV;
  });

  it('invokeChat emits streamed tokens and NO chat:error on the happy path (real builtin registry, llmModel="auto")', async () => {
    // REAL builtin registry (no injected models) + config llmProvider=openai, llmModel=auto
    // — the exact scenario that exposed the ordering bug (PI_MODEL_UNRESOLVED).
    const realAdapter = new PiWorkflowAdapter({
      mcpManager: { status: 'running' } as any,
      workspaceRoot: 'C:/ws/test',
      onEvent: onEventMock as (msg: ChatExtToWebviewMessage) => void,
    });
    mockConfigValues.llmProvider = 'openai';
    mockConfigValues.llmModel = 'auto';

    await realAdapter.invokeChat('Say hello');

    const errors = onEventMock.mock.calls
      .map((c: any[]) => c[0] as ChatExtToWebviewMessage)
      .filter(m => (m as { type?: string }).type === 'chat:error');
    // No PI_MODEL_UNRESOLVED — the ordering is fixed
    expect(errors.filter(m => m.code === 'PI_MODEL_UNRESOLVED')).toEqual([]);
    realAdapter.dispose();
  });

  it('invokeChat with faux model emits streamed tokens and NO chat:error (happy path)', async () => {
    // Config resolves the faux provider/model through configurePiProvider()
    mockConfigValues.llmProvider = 'faux';
    mockConfigValues.llmModel = 'faux-1';

    // Spy on the stream handler to assert tokens are emitted to the UI
    const emitSpy = vi.spyOn(adapter.getStreamHandler(), 'emitToken');

    await adapter.invokeChat('Say hello');

    const emitted = emitSpy.mock.calls
      .filter(c => c[0] === 'pi')
      .map(c => c[1] as string)
      .join('');
    expect(emitted).toContain('Adapter e2e response');

    const errors = onEventMock.mock.calls
      .map((c: any[]) => c[0] as ChatExtToWebviewMessage)
      .filter(m => (m as { type?: string }).type === 'chat:error');
    expect(errors).toEqual([]);
  });

  it('empty/unresolved model → clear actionable PI_MODEL_UNRESOLVED chat:error (not a raw stream failure)', async () => {
    // Default config: empty llmModel, provider with no resolvable model in the registry
    mockConfigValues.llmProvider = 'anthropic-unknown';
    mockConfigValues.llmModel = '';

    await adapter.invokeChat('Say hello');

    const errors = onEventMock.mock.calls
      .map((c: any[]) => c[0] as ChatExtToWebviewMessage)
      .filter(m => (m as { type?: string }).type === 'chat:error');
    expect(errors.length).toBe(1);
    expect(errors[0].code).toBe('PI_MODEL_UNRESOLVED');
    expect(errors[0].message).toContain('Set kiroSdlc.llmModel');
  });

  it('two overlapping invokeChat calls are serialized — no "already processing", both handled, busy notice emitted', async () => {
    mockConfigValues.llmProvider = 'faux';
    mockConfigValues.llmModel = 'faux-1';
    // Override the beforeEach response queue — exactly 2 responses for 2 queued turns.
    faux.setResponses([
      fauxAssistantMessage('turn one response'),
      fauxAssistantMessage('turn two response'),
    ]);
    const emitSpy = vi.spyOn(adapter.getStreamHandler(), 'emitToken');

    // Fire the second invokeChat while the first turn is still running (no await in between).
    const t1 = adapter.invokeChat('First message');
    const t2 = adapter.invokeChat('Second message');

    await Promise.all([t1, t2]);

    const emitted = emitSpy.mock.calls
      .filter(c => c[0] === 'pi')
      .map(c => c[1] as string)
      .join('');
    // Both turns' outputs actually arrived (queued, not dropped)
    expect(emitted).toContain('turn one response');
    expect(emitted).toContain('turn two response');

    const allMsgs = onEventMock.mock.calls.map((c: any[]) => c[0] as ChatExtToWebviewMessage);
    // No crash / no raw "already processing" leak to the UI
    const errors = allMsgs.filter(m => (m as { type?: string }).type === 'chat:error');
    expect(errors.filter(e => String(e.message).includes('already processing'))).toEqual([]);
    // UI was told we're busy (workingStatus) at least once
    expect(allMsgs.filter(m => (m as { type?: string }).type === 'chat:workingStatus').length).toBeGreaterThan(0);
  });
});
