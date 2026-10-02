import { describe, it, expect } from 'vitest';
import { StreamProtocolAdapter } from '../StreamProtocolAdapter';
import type { StreamChunkEvent, StreamCompleteEvent } from '../IStreamProtocolAdapter';

function chunk(streamId: string, content: string): StreamChunkEvent {
  return { type: 'chat:streamChunk', streamId, nodeId: 'pi', eventType: 'token', content, timestamp: new Date().toISOString() };
}

function complete(streamId: string): StreamCompleteEvent {
  return { type: 'chat:streamComplete', streamId, nodeId: 'pi', finalContent: 'done' };
}

describe('StreamProtocolAdapter — one turn = one bubble (streaming-identity fix)', () => {
  it('emits exactly one START for many chunks sharing a stable streamId', () => {
    const adapter = new StreamProtocolAdapter();
    const out = [
      ...adapter.handleEngineEvent(chunk('turn-1', 'hello')),
      ...adapter.handleEngineEvent(chunk('turn-1', ' world')),
      ...adapter.handleEngineEvent(chunk('turn-1', '!')),
    ];
    expect(out.filter((m) => m.type === 'STREAM_START')).toHaveLength(1);
    expect(out.filter((m) => m.type === 'STREAM_TOKEN')).toHaveLength(3);
    const ids = new Set(out.map((m) => (m as { messageId: string }).messageId));
    expect(ids.size).toBe(1);
  });

  it('completes with the SAME messageId as the tokens', () => {
    const adapter = new StreamProtocolAdapter();
    const first = adapter.handleEngineEvent(chunk('turn-9', 'hi'));
    const startId = (first[0] as { messageId: string }).messageId;
    const end = adapter.handleEngineEvent(complete('turn-9'));
    expect(end).toHaveLength(1);
    expect(end[0].type).toBe('STREAM_END');
    expect((end[0] as { messageId: string }).messageId).toBe(startId);
  });

  it('a new streamId opens a new bubble (multi-turn sequencing)', () => {
    const adapter = new StreamProtocolAdapter();
    const a = adapter.handleEngineEvent(chunk('turn-1', 'a'));
    const b = adapter.handleEngineEvent(chunk('turn-2', 'b'));
    const idA = (a[0] as { messageId: string }).messageId;
    const idB = (b[0] as { messageId: string }).messageId;
    expect(idA).not.toBe(idB);
  });

  it('orphan error bubbles are cleaned up immediately (no map leak)', () => {
    const adapter = new StreamProtocolAdapter();
    const first = adapter.handleEngineEvent({
      type: 'chat:streamChunk', streamId: 'error-stream', nodeId: 'pi', eventType: 'error', content: 'boom-1', timestamp: '',
    });
    const second = adapter.handleEngineEvent({
      type: 'chat:streamChunk', streamId: 'error-stream', nodeId: 'pi', eventType: 'error', content: 'boom-2', timestamp: '',
    });
    const id1 = (first.find((m) => m.type === 'STREAM_ERROR') as { messageId: string }).messageId;
    const id2 = (second.find((m) => m.type === 'STREAM_ERROR') as { messageId: string }).messageId;
    expect(id1).not.toBe(id2);
    expect(adapter.getMessageIdForStream('error-stream')).toBeUndefined();
  });
});
