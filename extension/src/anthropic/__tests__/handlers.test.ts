/**
 * handleChatCompletions — happy path + ReAct tool loop (TC-3, TC-4).
 * Restored to runnable state: the committed WIP referenced an unfinished
 * supertest-style harness (createTestApp/request) that never existed and
 * express is not a runtime dependency. Tests now invoke the handler
 * directly via the shared mock helpers — assertions preserved.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConversationHistory } from '../../history/conversation';
import { KiroQResponse, ContinuationRequest } from '../types';
import { invokeHandler } from './handlers.helpers';

describe('handleChatCompletions', () => {
  let history: ConversationHistory;

  beforeEach(() => {
    history = new ConversationHistory();
  });

  // TC-3: Continuation matches history
  it('TC-3: continuation request matches stored tool_use_id in history', async () => {
    // Pre-populate history with a tool_use
    const initialResponse: KiroQResponse = {
      id: 'msg_init',
      type: 'message',
      role: 'assistant',
      content: [{
        type: 'tool_use',
        id: 'tooluse_ABC123',
        name: 'readFile',
        input: { path: '/src/main.ts' },
      }],
      stop_reason: 'tool_use',
    };
    history.addAssistantMessage(initialResponse);

    // Mock: next response after tool result is text
    const nextResponse: KiroQResponse = {
      id: 'msg_next',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'Analysis complete.' }],
      stop_reason: 'end_turn',
    };
    const mockForward = vi.fn().mockResolvedValue(nextResponse);

    const res = await invokeHandler(history, mockForward, {
      messages: [],
      toolResult: {
        toolUseId: 'tooluse_ABC123',
        content: 'file contents here',
        isError: false,
      },
    } as ContinuationRequest);

    // Should stream SSE response
    expect(res.getStatus()).toBe(200);
    expect(res.getHeaders()['Content-Type']).toContain('text/event-stream');
    expect(res.getBody()).toContain('message_stop');
    expect(mockForward).toHaveBeenCalledTimes(1);
  });

  // TC-4: Full ReAct loop - no 400 error
  it('TC-4: full ReAct loop completes without 400 error', async () => {
    // Step 1: Initial request -> API returns tool_use
    const toolUseResponse: KiroQResponse = {
      id: 'msg_tool',
      type: 'message',
      role: 'assistant',
      content: [{
        type: 'tool_use',
        id: 'tooluse_LoopTest',
        name: 'readFile',
        input: { path: '/test.ts' },
      }],
      stop_reason: 'tool_use',
    };

    // Step 2: After continuation -> API returns final text
    const finalResponse: KiroQResponse = {
      id: 'msg_final',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'Done analyzing.' }],
      stop_reason: 'end_turn',
    };

    let callCount = 0;
    const mockForward = vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve(callCount === 1 ? toolUseResponse : finalResponse);
    });

    // Initial request
    const res1 = await invokeHandler(history, mockForward, {
      messages: [{ role: 'user', content: 'Read test.ts' }],
    } as ContinuationRequest);

    expect(res1.getStatus()).toBe(200);
    expect(res1.getBody()).toContain('tooluse_LoopTest');
    expect(res1.getBody()).toContain('content_block_start');

    // Continuation with tool result (should NOT 400)
    const res2 = await invokeHandler(history, mockForward, {
      messages: [],
      toolResult: {
        toolUseId: 'tooluse_LoopTest',
        content: 'file content',
        isError: false,
      },
    } as ContinuationRequest);

    expect(res2.getStatus()).toBe(200);
    expect(res2.getBody()).toContain('message_stop');
    expect(res2.getBody()).toContain('text_delta');
  });

  // SSE headers
  it('sets correct SSE headers on success', async () => {
    const response: KiroQResponse = {
      id: 'msg_headers',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'hi' }],
      stop_reason: 'end_turn',
    };
    const mockForward = vi.fn().mockResolvedValue(response);

    const res = await invokeHandler(history, mockForward, {
      messages: [{ role: 'user', content: 'hello' }],
    } as ContinuationRequest);

    expect(res.getStatus()).toBe(200);
    expect(res.getHeaders()['Content-Type']).toContain('text/event-stream');
    expect(res.getHeaders()['Cache-Control']).toBe('no-cache');
  });
});
