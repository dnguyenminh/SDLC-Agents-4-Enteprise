/**
 * Thinking (reasoning) display pipeline — unit tests.
 * Covers the full chain added for the SDLC CHAT thinking block:
 *   pi-ai thinking_delta → mapAgentEvent 'thinking' chunk
 *   → StreamHandler.emitThinking (chat:streamChunk eventType "thinking")
 *   → StreamProtocolAdapter THINKING_START/TOKEN/END lifecycle.
 */
import { describe, it, expect } from 'vitest';
import { mapAgentEvent, type EventCollector } from '../pi-event-mapper.js';
import type { AgentEvent } from '@earendil-works/pi-agent-core';
import { StreamHandler } from '../../mcp/stream-handler.js';
import type { ChatExtToWebviewMessage } from '../../chat-panel/message-protocol';
import { StreamProtocolAdapter } from '../../chat/engine/StreamProtocolAdapter.js';
import type { ExtensionMessage } from '../../chat/types';

function collector(): EventCollector {
  return { chunks: [], toolCalls: [], text: '', thinking: '' };
}

function thinkingDelta(delta: string): AgentEvent {
  return {
    type: 'message_update',
    assistantMessageEvent: { type: 'thinking_delta', delta, contentIndex: 0 },
  } as unknown as AgentEvent;
}

describe('mapAgentEvent — thinking_delta → thinking chunks', () => {
  it('emits a thinking chunk per delta and accumulates collector.thinking', () => {
    const c = collector();
    mapAgentEvent(thinkingDelta('Ta cần '), c);
    mapAgentEvent(thinkingDelta('kiểm tra file trước.'), c);
    expect(c.chunks).toHaveLength(2);
    expect(c.chunks[0]).toEqual({ type: 'thinking', content: 'Ta cần ' });
    expect(c.thinking).toBe('Ta cần kiểm tra file trước.');
    // reasoning must NEVER leak into the answer text
    expect(c.text).toBe('');
  });

  it('still maps text_delta after thinking (interleaved streams)', () => {
    const c = collector();
    mapAgentEvent(thinkingDelta('plan'), c);
    mapAgentEvent({
      type: 'message_update',
      assistantMessageEvent: { type: 'text_delta', delta: 'Xin chào', contentIndex: 0 },
    } as unknown as AgentEvent, c);
    expect(c.text).toBe('Xin chào');
    expect(c.thinking).toBe('plan');
    expect(c.chunks.map((ch) => ch.type)).toEqual(['thinking', 'text']);
  });
});

describe('StreamHandler.emitThinking', () => {
  it('buffers thinking deltas as chat:streamChunk eventType "thinking"', () => {
    const sent: ChatExtToWebviewMessage[] = [];
    const h = new StreamHandler((m) => sent.push(m));
    h.emitThinking('pi', 'bước 1: đọc code', 's-1');
    h.dispose(); // flush
    const thinking = sent.filter((m) => (m as { eventType?: string }).eventType === 'thinking');
    expect(thinking).toHaveLength(1);
    const t = thinking[0] as { type: string; nodeId: string; content: string };
    expect(t.type).toBe('chat:streamChunk');
    expect(t.nodeId).toBe('pi');
    expect(t.content).toBe('bước 1: đọc code');
  });
});

describe('StreamProtocolAdapter — THINKING_* lifecycle', () => {
  const chunk = (eventType: 'thinking' | 'token', content: string) =>
    ({
      type: 'chat:streamChunk',
      streamId: 's-9',
      nodeId: 'pi',
      eventType,
      content,
      timestamp: new Date().toISOString(),
    }) as const;

  it('first thinking chunk emits THINKING_START + THINKING_TOKEN; subsequent deltas only TOKEN', () => {
    const a = new StreamProtocolAdapter();
    const m1 = a.handleEngineEvent(chunk('thinking', 'thinking... '));
    const types1 = m1.map((m) => m.type);
    expect(types1).toEqual(['STREAM_START', 'THINKING_START', 'THINKING_TOKEN']);
    const m2 = a.handleEngineEvent(chunk('thinking', 'more'));
    expect(m2.map((m) => m.type)).toEqual(['THINKING_TOKEN']);
  });

  it('first answer token closes the thinking block (THINKING_END) before STREAM_TOKEN', () => {
    const a = new StreamProtocolAdapter();
    a.handleEngineEvent(chunk('thinking', 'reasoning'));
    const m = a.handleEngineEvent(chunk('token', 'Answer'));
    expect(m.map((x) => x.type)).toEqual(['THINKING_END', 'STREAM_TOKEN']);
  });

  it('stream end closes an open thinking block before STREAM_END', () => {
    const a = new StreamProtocolAdapter();
    a.handleEngineEvent(chunk('thinking', 'unfinished reasoning'));
    const m = a.handleEngineEvent({
      type: 'chat:streamComplete',
      streamId: 's-9',
      nodeId: 'pi',
      finalContent: '',
    });
    expect(m.map((x) => x.type)).toEqual(['THINKING_END', 'STREAM_END']);
  });

  it('no dangling THINKING_END when thinking never opened', () => {
    const a = new StreamProtocolAdapter();
    const m = a.handleEngineEvent(chunk('token', 'Direct answer'));
    expect(m.map((x) => x.type)).toEqual(['STREAM_START', 'STREAM_TOKEN']);
    const m2 = a.handleEngineEvent({
      type: 'chat:streamComplete',
      streamId: 's-9',
      nodeId: 'pi',
      finalContent: 'Direct answer',
    });
    expect(m2.map((x) => x.type)).toEqual(['STREAM_END']);
  });

  it('THINKING_TOKEN carries the delta text', () => {
    const a = new StreamProtocolAdapter();
    const m = a.handleEngineEvent(chunk('thinking', 'kiểm tra kiến trúc')) as ExtensionMessage[];
    const tok = m.find((x) => x.type === 'THINKING_TOKEN') as { token: string };
    expect(tok.token).toBe('kiểm tra kiến trúc');
  });
});
