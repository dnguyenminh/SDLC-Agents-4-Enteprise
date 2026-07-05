import { describe, it, expect } from 'vitest';
import { convertResponseToSSEEvents, validateToolUseId, extractToolUseIds } from '../converter';
import { KiroQResponse, ContentBlockStartEvent } from '../types';

describe('convertResponseToSSEEvents', () => {
  // TC-1: Single tool_use - ID preserved in SSE stream
  it('TC-1: preserves tool_use_id in SSE stream', () => {
    const response: KiroQResponse = {
      id: 'msg_123',
      type: 'message',
      role: 'assistant',
      content: [{
        type: 'tool_use',
        id: 'tooluse_490CAbc',
        name: 'readFile',
        input: { path: '/src/main.ts' },
      }],
      stop_reason: 'tool_use',
    };

    const events = convertResponseToSSEEvents(response);
    const startEvent = events.find(e => e.type === 'content_block_start') as ContentBlockStartEvent;

    expect(startEvent).toBeDefined();
    expect(startEvent.content_block.id).toBe('tooluse_490CAbc');
    expect(startEvent.content_block.name).toBe('readFile');
    expect(startEvent.content_block.type).toBe('tool_use');
  });

  // TC-5: Multiple tool_use blocks - all IDs preserved independently
  it('TC-5: preserves multiple tool_use_ids independently', () => {
    const response: KiroQResponse = {
      id: 'msg_456',
      type: 'message',
      role: 'assistant',
      content: [
        { type: 'tool_use', id: 'tooluse_AAA', name: 'readFile', input: { path: '/a' } },
        { type: 'tool_use', id: 'tooluse_BBB', name: 'grep_search', input: { query: 'x' } },
        { type: 'tool_use', id: 'tooluse_CCC', name: 'writeFile', input: { path: '/b' } },
      ],
      stop_reason: 'tool_use',
    };

    const events = convertResponseToSSEEvents(response);
    const startEvents = events.filter(
      (e): e is ContentBlockStartEvent => e.type === 'content_block_start'
    );

    expect(startEvents).toHaveLength(3);
    expect(startEvents[0].content_block.id).toBe('tooluse_AAA');
    expect(startEvents[1].content_block.id).toBe('tooluse_BBB');
    expect(startEvents[2].content_block.id).toBe('tooluse_CCC');
  });

  // TC-10: Regression guard - no ID generation, exact passthrough
  it('TC-10: no call to ID generation - exact passthrough regression guard', () => {
    const inputId = 'tooluse_ExactMatch123';
    const response: KiroQResponse = {
      id: 'msg_789',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'tool_use', id: inputId, name: 'test', input: {} }],
      stop_reason: 'tool_use',
    };

    const events = convertResponseToSSEEvents(response);
    const ids = extractToolUseIds(response);

    // Both extraction methods return the exact same input ID
    expect(ids).toEqual([inputId]);
    const startEvent = events.find(
      (e): e is ContentBlockStartEvent => e.type === 'content_block_start'
    ) as ContentBlockStartEvent;
    expect(startEvent.content_block.id).toBe(inputId);
  });

  it('handles text blocks without id field', () => {
    const response: KiroQResponse = {
      id: 'msg_text',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'Hello world' }],
      stop_reason: 'end_turn',
    };

    const events = convertResponseToSSEEvents(response);
    const startEvent = events.find(
      (e): e is ContentBlockStartEvent => e.type === 'content_block_start'
    ) as ContentBlockStartEvent;

    expect(startEvent.content_block.type).toBe('text');
    expect(startEvent.content_block.id).toBeUndefined();
  });

  it('produces correct event sequence for tool_use block', () => {
    const response: KiroQResponse = {
      id: 'msg_seq',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'tool_use', id: 'tooluse_SEQ1', name: 'readFile', input: { path: '/x' } }],
      stop_reason: 'tool_use',
    };

    const events = convertResponseToSSEEvents(response);
    const types = events.map(e => e.type);

    expect(types).toEqual([
      'content_block_start',
      'content_block_delta',
      'content_block_stop',
      'message_stop',
    ]);
  });

  it('streams tool input as JSON delta', () => {
    const input = { path: '/src/main.ts', encoding: 'utf-8' };
    const response: KiroQResponse = {
      id: 'msg_delta',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'tool_use', id: 'tooluse_DELTA', name: 'readFile', input }],
      stop_reason: 'tool_use',
    };

    const events = convertResponseToSSEEvents(response);
    const deltaEvent = events.find(e => e.type === 'content_block_delta');

    expect(deltaEvent).toBeDefined();
    if (deltaEvent && deltaEvent.type === 'content_block_delta') {
      expect(deltaEvent.delta.type).toBe('input_json_delta');
      expect(deltaEvent.delta.partial_json).toBe(JSON.stringify(input));
    }
  });
});

describe('extractToolUseIds', () => {
  it('returns empty array for text-only response', () => {
    const response: KiroQResponse = {
      id: 'msg_no_tools',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'No tools needed' }],
      stop_reason: 'end_turn',
    };

    expect(extractToolUseIds(response)).toEqual([]);
  });

  it('returns all tool_use ids in order', () => {
    const response: KiroQResponse = {
      id: 'msg_multi',
      type: 'message',
      role: 'assistant',
      content: [
        { type: 'tool_use', id: 'tooluse_First', name: 'a', input: {} },
        { type: 'text', text: 'some text' },
        { type: 'tool_use', id: 'tooluse_Second', name: 'b', input: {} },
      ],
      stop_reason: 'tool_use',
    };

    expect(extractToolUseIds(response)).toEqual(['tooluse_First', 'tooluse_Second']);
  });
});

describe('validateToolUseId', () => {
  // TC-7: Rejects empty string
  it('TC-7: rejects empty string', () => {
    expect(validateToolUseId('')).toBe(false);
  });

  // TC-8: Rejects undefined/null/non-string
  it('TC-8: rejects undefined', () => {
    expect(validateToolUseId(undefined)).toBe(false);
  });

  it('TC-8: rejects null', () => {
    expect(validateToolUseId(null)).toBe(false);
  });

  it('TC-8: rejects number', () => {
    expect(validateToolUseId(12345)).toBe(false);
  });

  it('rejects string without tooluse_ prefix', () => {
    expect(validateToolUseId('abc123')).toBe(false);
  });

  it('rejects string with special characters', () => {
    expect(validateToolUseId('tooluse_abc-def')).toBe(false);
    expect(validateToolUseId('tooluse_abc_def')).toBe(false);
    expect(validateToolUseId('tooluse_abc.def')).toBe(false);
  });

  it('accepts valid tooluse_[A-Za-z0-9]+ format', () => {
    expect(validateToolUseId('tooluse_ABC123')).toBe(true);
    expect(validateToolUseId('tooluse_a')).toBe(true);
    expect(validateToolUseId('tooluse_490CAbc')).toBe(true);
    expect(validateToolUseId('tooluse_ExactMatch123')).toBe(true);
  });
});
