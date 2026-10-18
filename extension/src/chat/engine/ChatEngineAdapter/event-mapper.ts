/**
 * Engine event → stream event translation (SA4E-85).
 * Tracks the currently open stream so orphan errors can attach to it.
 */

import type { ChatExtToWebviewMessage } from '../../../chat-panel/message-protocol';
import type { EngineStreamEvent } from '../IStreamProtocolAdapter';

/** Convert ChatExtToWebviewMessage to EngineStreamEvent (or null). */
export class StreamEventMapper {
  /** Latest stream seen — orphan errors attach here so bubbles can close. */
  private lastStreamId: string | undefined;

  map(event: ChatExtToWebviewMessage): EngineStreamEvent | null {
    if (event.type === 'chat:streamChunk') {
      const e = event as any;
      if (e.streamId) this.lastStreamId = e.streamId;
      if (e.eventType === 'token' || e.eventType === 'thinking' || e.eventType === 'status' || e.eventType === 'error') {
        return { type: 'chat:streamChunk', streamId: e.streamId, nodeId: e.nodeId, eventType: e.eventType, content: e.content, timestamp: e.timestamp };
      }
    }
    if (event.type === 'chat:streamComplete') {
      const e = event as any;
      if (e.streamId) this.lastStreamId = e.streamId;
      const mapped: EngineStreamEvent = { type: 'chat:streamComplete', streamId: e.streamId, nodeId: e.nodeId, finalContent: e.finalContent };
      // The stream is closed: a later pre-token error must not attach to it.
      this.lastStreamId = undefined;
      return mapped;
    }
    if (event.type === 'chat:toolCall') {
      return { type: 'chat:toolCall', toolCall: (event as any).toolCall };
    }
    if (event.type === 'chat:toolCallUpdate') {
      // FIX F: forward tool result/status so the webview can complete/fail the block.
      const e = event as { id?: string; status?: 'running' | 'completed' | 'failed'; result?: string; duration?: number };
      if (!e.id) return null;
      return {
        type: 'chat:toolCallUpdate',
        id: e.id,
        status: e.status ?? 'completed',
        result: e.result,
        duration: e.duration,
      };
    }
    if (event.type === 'chat:error') {
      // Errors carry no streamId — attach to the currently open stream so
      // the bubble shows the failure and can be closed (previously swallowed).
      const e = event as any;
      return {
        type: 'chat:streamChunk',
        streamId: this.lastStreamId ?? 'error-stream',
        nodeId: 'pi',
        eventType: 'error',
        content: `${e.code || 'ERROR'}: ${e.message || 'Unknown error'}`,
        timestamp: new Date().toISOString(),
      };
    }
    return null;
  }
}
