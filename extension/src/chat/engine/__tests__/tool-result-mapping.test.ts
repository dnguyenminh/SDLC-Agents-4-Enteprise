/**
 * FIX F — chat:toolCallUpdate → MCP_TOOL_RESULT mapping.
 * Regression lock: tool results must reach the webview so RESPONSE blocks
 * leave "(waiting...)" (messageListener → completeToolCall/failToolCall).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ExtensionMessage } from '../../../chat/types';
import type { IMessageRouter, MessageHandler } from '../../../chat/router';
import type { IPostMessageBridge } from '../../../chat/bridge';
import type { ISessionManager } from '../ISessionManager';
import { ChatEngineAdapter, type ChatEngineAdapterDeps } from '../ChatEngineAdapter';
import { StreamProtocolAdapter } from '../StreamProtocolAdapter';
import type { ChatExtToWebviewMessage } from '../../../chat-panel/message-protocol';

describe('FIX F — tool result mapping (chat:toolCallUpdate → MCP_TOOL_RESULT)', () => {
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

  it('completed update with result → MCP_TOOL_RESULT carrying the output text', () => {
    adapter.handleEngineEvent({
      type: 'chat:toolCallUpdate',
      id: 'tc-1',
      status: 'completed',
      result: 'line1\nline2',
      duration: 182,
    } as unknown as ChatExtToWebviewMessage);

    const results = posted.filter((m) => m.type === 'MCP_TOOL_RESULT');
    expect(results).toHaveLength(1);
    const r = results[0] as Extract<ExtensionMessage, { type: 'MCP_TOOL_RESULT' }>;
    expect(r.toolId).toBe('tc-1');
    expect(r.result.content).toBe('line1\nline2');
    expect(r.result.isError).toBe(false);
    expect(r.result.duration).toBe(182);
    expect(r.error).toBeUndefined();
  });

  it('completed update with NO result still completes the block (empty output ≠ waiting)', () => {
    adapter.handleEngineEvent({
      type: 'chat:toolCallUpdate',
      id: 'tc-2',
      status: 'completed',
      duration: 42,
    } as unknown as ChatExtToWebviewMessage);

    const r = posted.find((m) => m.type === 'MCP_TOOL_RESULT') as Extract<ExtensionMessage, { type: 'MCP_TOOL_RESULT' }>;
    expect(r).toBeDefined();
    expect(r.result.content).toBe('');
    expect(r.error).toBeUndefined();
  });

  it('failed update → MCP_TOOL_RESULT with error so failToolCall runs', () => {
    adapter.handleEngineEvent({
      type: 'chat:toolCallUpdate',
      id: 'tc-3',
      status: 'failed',
      result: 'command not found: foo',
    } as unknown as ChatExtToWebviewMessage);

    const r = posted.find((m) => m.type === 'MCP_TOOL_RESULT') as Extract<ExtensionMessage, { type: 'MCP_TOOL_RESULT' }>;
    expect(r).toBeDefined();
    expect(r.error).toBe('command not found: foo');
    expect(r.result.isError).toBe(true);
    expect(r.result.content).toBe('command not found: foo');
  });

  it('failed update with no result falls back to a generic error', () => {
    adapter.handleEngineEvent({
      type: 'chat:toolCallUpdate',
      id: 'tc-4',
      status: 'failed',
    } as unknown as ChatExtToWebviewMessage);

    const r = posted.find((m) => m.type === 'MCP_TOOL_RESULT') as Extract<ExtensionMessage, { type: 'MCP_TOOL_RESULT' }>;
    expect(r).toBeDefined();
    expect(r.error).toBe('Tool execution failed');
  });

  it('running status and id-less updates emit nothing', () => {
    adapter.handleEngineEvent({
      type: 'chat:toolCallUpdate',
      id: 'tc-5',
      status: 'running',
    } as unknown as ChatExtToWebviewMessage);
    adapter.handleEngineEvent({
      type: 'chat:toolCallUpdate',
      status: 'completed',
      result: 'orphan',
    } as unknown as ChatExtToWebviewMessage);
    expect(posted.filter((m) => m.type === 'MCP_TOOL_RESULT')).toHaveLength(0);
  });
});
