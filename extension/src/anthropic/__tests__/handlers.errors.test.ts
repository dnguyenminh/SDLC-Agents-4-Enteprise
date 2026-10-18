/**
 * handleChatCompletions — diagnostic error paths (UC-2 / BR-3 / BR-6..8).
 * Restored to runnable state: the committed WIP referenced an unfinished
 * supertest-style harness that never existed. Tests invoke the handler
 * directly via the shared mock helpers — assertions preserved.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConversationHistory } from '../../history/conversation';
import { KiroQResponse, ContinuationRequest } from '../types';
import { invokeHandler } from './handlers.helpers';

describe('handleChatCompletions — errors', () => {
  let history: ConversationHistory;

  beforeEach(() => {
    history = new ConversationHistory();
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

    // Send continuation with WRONG ID
    const res = await invokeHandler(history, mockForward, {
      messages: [],
      toolResult: {
        toolUseId: 'tooluse_WRONGID',
        content: 'some result',
        isError: false,
      },
    } as ContinuationRequest);

    expect(res.getStatus()).toBe(400);

    // Verify descriptive error (BR-8)
    expect(res.getJson().error.type).toBe('tool_use_id_mismatch');
    expect(res.getJson().error.message).toContain('tooluse_WRONGID');
    expect(res.getJson().error.message).toContain('not found in conversation history');
    expect(res.getJson().error.received_id).toBe('tooluse_WRONGID');
    expect(res.getJson().error.available_ids).toContain('tooluse_KnownID');
    expect(res.getJson().error.turn_number).toBeGreaterThan(0);

    // forwardToKiroQ should NOT be called on mismatch
    expect(mockForward).not.toHaveBeenCalled();
  });

  // TC-6 extension: Empty history case
  it('TC-6: returns empty available_ids when history has no tool_use entries', async () => {
    const mockForward = vi.fn();

    const res = await invokeHandler(history, mockForward, {
      messages: [],
      toolResult: {
        toolUseId: 'tooluse_Orphan',
        content: 'result',
        isError: false,
      },
    } as ContinuationRequest);

    expect(res.getStatus()).toBe(400);
    expect(res.getJson().error.available_ids).toEqual([]);
    expect(res.getJson().error.turn_number).toBe(0);
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

    const res = await invokeHandler(history, mockForward, {
      messages: [{ role: 'user', content: 'test' }],
    } as ContinuationRequest);

    expect(res.getStatus()).toBe(502);
    expect(res.getJson().error.type).toBe('malformed_api_response');
  });

  // Upstream error handling
  it('returns 502 when Kiro Q API call fails', async () => {
    const mockForward = vi.fn().mockRejectedValue(new Error('Network timeout'));

    const res = await invokeHandler(history, mockForward, {
      messages: [{ role: 'user', content: 'test' }],
    } as ContinuationRequest);

    expect(res.getStatus()).toBe(502);
    expect(res.getJson().error.type).toBe('upstream_error');
  });
});
