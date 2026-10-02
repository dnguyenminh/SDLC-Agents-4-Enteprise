import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ExtensionMessage } from '../../../chat/types';
import type { IMessageRouter, MessageHandler } from '../../../chat/router';
import type { IPostMessageBridge } from '../../../chat/bridge';
import type { ISessionManager } from '../ISessionManager';
import { ChatEngineAdapter, type ChatEngineAdapterDeps } from '../ChatEngineAdapter';
import { StreamProtocolAdapter } from '../StreamProtocolAdapter';
import type { ChatExtToWebviewMessage } from '../../../chat-panel/message-protocol';

describe('ChatEngineAdapter — engine fan-out mapping (streaming-identity fix)', () => {
  const handlers = new Map<string, MessageHandler>();
  let posted: ExtensionMessage[];
  let adapter: ChatEngineAdapter;

  const router: IMessageRouter = {
    registerHandler: (type, handler) => { handlers.set(type, handler); },
    unregisterHandler: (type) => { handlers.delete(type); },
    dispatch: async () => {},
    postToWebview: () => {},
    hasHandler: (type) => handlers.has(type),
    dispose: () => {},
  };

  const bridge: IPostMessageBridge = {
    postToWebview: (msg) => { posted.push(msg); },
    onMessage: () => {},
    flush: () => {},
    dispose: () => {},
  };

  const sessionManager: ISessionManager = {
    ensureSession: async () => ({ thread_id: 't', started_at: '', ide: 'vscode' }),
    getSession: () => null,
    getSessionMessages: vi.fn(),
    cleanup: async () => {},
    dispose: () => {},
  };

  function buildDeps(): ChatEngineAdapterDeps {
    return {
      router,
      bridge,
      engine: {} as ChatEngineAdapterDeps['engine'],
      streamAdapter: new StreamProtocolAdapter(),
      contextManager: { getState: () => ({ tokenCount: 0, maxTokens: 200000, files: [], usagePercent: 0, pruneSuggestions: [] }), pinFile: () => {}, unpinFile: () => {}, clearAll: () => {}, suggestPrune: () => [], onContextChanged: undefined },
      toolHandler: { applyDiff: async () => {}, rejectDiff: () => {}, runTerminalCommand: () => {}, regeneratePatch: async () => {} },
      sessionManager,
    };
  }

  beforeEach(() => {
    handlers.clear();
    posted = [];
    adapter = new ChatEngineAdapter(buildDeps());
    adapter.initialize();
  });

  it('maps chat:error onto the open stream so the bubble shows and closes', () => {
    adapter.handleEngineEvent({
      type: 'chat:streamChunk', streamId: 'turn-1', nodeId: 'pi', eventType: 'token', content: 'hi', timestamp: '',
    } as unknown as ChatExtToWebviewMessage);
    adapter.handleEngineEvent({
      type: 'chat:error', code: 'E_T', message: 'boom', retryable: true,
    } as unknown as ChatExtToWebviewMessage);

    const starts = posted.filter((m) => m.type === 'STREAM_START');
    const errors = posted.filter((m) => m.type === 'STREAM_ERROR');
    expect(starts).toHaveLength(1);
    expect(errors).toHaveLength(1);
    // Same bubble: error reuses the open stream's messageId.
    expect((errors[0] as { messageId: string }).messageId)
      .toBe((starts[0] as { messageId: string }).messageId);
    if (errors[0].type === 'STREAM_ERROR') {
      expect(errors[0].error.message).toContain('boom');
    }
  });

  it('orphan errors still surface (synthetic stream) instead of vanishing', () => {
    adapter.handleEngineEvent({
      type: 'chat:error', code: 'E_X', message: 'gone wrong', retryable: false,
    } as unknown as ChatExtToWebviewMessage);
    const errors = posted.filter((m) => m.type === 'STREAM_ERROR');
    expect(errors).toHaveLength(1);
  });

  it('pre-token errors after a close do not reuse the closed stream', () => {
    adapter.handleEngineEvent({
      type: 'chat:streamChunk', streamId: 'turn-1', nodeId: 'pi', eventType: 'token', content: 'a', timestamp: '',
    } as unknown as ChatExtToWebviewMessage);
    adapter.handleEngineEvent({
      type: 'chat:streamComplete', streamId: 'turn-1', nodeId: 'pi', finalContent: 'a',
    } as unknown as ChatExtToWebviewMessage);
    const firstId = (posted.find((m) => m.type === 'STREAM_START') as { messageId: string }).messageId;
    adapter.handleEngineEvent({
      type: 'chat:error', code: 'E_PRE', message: 'pre-token failure', retryable: true,
    } as unknown as ChatExtToWebviewMessage);
    const errors = posted.filter((m) => m.type === 'STREAM_ERROR') as Array<{ messageId: string }>;
    expect(errors).toHaveLength(1);
    expect(errors[0].messageId).not.toBe(firstId);
  });

  it('token and completion share one messageId end to end', () => {
    adapter.handleEngineEvent({
      type: 'chat:streamChunk', streamId: 'turn-7', nodeId: 'pi', eventType: 'token', content: 'a', timestamp: '',
    } as unknown as ChatExtToWebviewMessage);
    adapter.handleEngineEvent({
      type: 'chat:streamComplete', streamId: 'turn-7', nodeId: 'pi', finalContent: 'a',
    } as unknown as ChatExtToWebviewMessage);
    const starts = posted.filter((m) => m.type === 'STREAM_START') as Array<{ messageId: string }>;
    const ends = posted.filter((m) => m.type === 'STREAM_END') as Array<{ messageId: string }>;
    expect(starts).toHaveLength(1);
    expect(ends).toHaveLength(1);
    expect(ends[0].messageId).toBe(starts[0].messageId);
  });
});
