import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createChatCompletionsHandler } from '../handlers';
import { ConversationHistory } from '../../history/conversation';
import { KiroQResponse, ContinuationRequest } from '../types';

function createTestApp(
  history: ConversationHistory,
  mockForward: (req: ContinuationRequest) => Promise<KiroQResponse>,
) {
  const app = express();
  app.use(express.json());
  app.post('/chat/completions', createChatCompletionsHandler(history, mockForward));
  return app;
}

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

    const app = createTestApp(history, mockForward);

    const res = await request(app)
      .post('/chat/completions')
      .send({
        messages: [],
        toolResult: {
          toolUseId: 'tooluse_ABC123',
          content: 'file contents here',
          isError: false,
        },
      })
      .expect(200);

    // Should stream SSE response
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.text).toContain('message_stop');
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

    const app = createTestApp(history, mockForward);

    // Initial request
    const res1 = await request(app)
      .post('/chat/completions')
      .send({ messages: [{ role: 'user', content: 'Read test.ts' }] })
      .expect(200);

    expect(res1.text).toContain('tooluse_LoopTest');
    expect(res1.text).toContain('content_block_start');

    // Continuation with tool result (should NOT 400)
    const res2 = await request(app)
      .post('/chat/completions')
      .send({
        messages: [],
        toolResult: {
          toolUseId: 'tooluse_LoopTest',
          content: 'file content',
          isError: false,
        },
      })
      .expect(200);

    expect(res2.text).toContain('message_stop');
    expect(res2.text).toContain('text_delta');
  });

  // TC-6: Mismatch diagnostic - ID not found
  it('TC-6: returns descriptive error when tool_use_id not found in history', async () => {
    // Pre-populate with known ID
    const response: KiroQResponse = {
      id: 'msg_known',
      type: 'message',
      role: 'assistant',
      content: [{
        type: 'tool_use',
        id: 'tooluse_KnownID',
        name: 'readFile',
        input: {},
      }],
      stop_reason: 'tool_use',
    };
    history.addAssistantMessage(response);

    const mockForward = vi.fn();
    const app = createTestApp(history, mockForward);

    // Send continuation with WRONG ID
    const res = await request(app)
      .post('/chat/completions')
      .send({
        messages: [],
        toolResult: {
          toolUseId: 'tooluse_WRONGID',
          content: 'some result',
          isError: false,
        },
      })
      .expect(400);

    // Verify descriptive error (BR-8)
    expect(res.body.error.type).toBe('tool_use_id_mismatch');
    expect(res.body.error.message).toContain('tooluse_WRONGID');
    expect(res.body.error.message).toContain('not found in conversation history');
    expect(res.body.error.received_id).toBe('tooluse_WRONGID');
    expect(res.body.error.available_ids).toContain('tooluse_KnownID');
    expect(res.body.error.turn_number).toBeGreaterThan(0);

    // forwardToKiroQ should NOT be called on mismatch
    expect(mockForward).not.toHaveBeenCalled();
  });

  // TC-6 extension: Empty history case
  it('TC-6: returns empty available_ids when history has no tool_use entries', async () => {
    const mockForward = vi.fn();
    const app = createTestApp(history, mockForward);

    const res = await request(app)
      .post('/chat/completions')
      .send({
        messages: [],
        toolResult: {
          toolUseId: 'tooluse_Orphan',
          content: 'result',
          isError: false,
        },
      })
      .expect(400);

    expect(res.body.error.available_ids).toEqual([]);
    expect(res.body.error.turn_number).toBe(0);
  });

  // Malformed API response (invalid tool_use_id from upstream)
  it('returns 502 when API returns invalid tool_use_id', async () => {
    const malformedResponse: KiroQResponse = {
      id: 'msg_bad',
      type: 'message',
      role: 'assistant',
      content: [{
        type: 'tool_use',
        id: '', // Empty - invalid (BR-3)
        name: 'readFile',
        input: {},
      }],
      stop_reason: 'tool_use',
    };
    const mockForward = vi.fn().mockResolvedValue(malformedResponse);
    const app = createTestApp(history, mockForward);

    const res = await request(app)
      .post('/chat/completions')
      .send({ messages: [{ role: 'user', content: 'test' }] })
      .expect(502);

    expect(res.body.error.type).toBe('malformed_api_response');
  });

  // Upstream error handling
  it('returns 502 when Kiro Q API call fails', async () => {
    const mockForward = vi.fn().mockRejectedValue(new Error('Network timeout'));
    const app = createTestApp(history, mockForward);

    const res = await request(app)
      .post('/chat/completions')
      .send({ messages: [{ role: 'user', content: 'test' }] })
      .expect(502);

    expect(res.body.error.type).toBe('upstream_error');
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
    const app = createTestApp(history, mockForward);

    const res = await request(app)
      .post('/chat/completions')
      .send({ messages: [{ role: 'user', content: 'hello' }] })
      .expect(200);

    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.headers['cache-control']).toBe('no-cache');
  });
});
