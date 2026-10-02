/**
 * SA4E-85 — StreamProtocolAdapter implementation.
 * Translates LangGraph engine events (chat:streamChunk/Complete/toolCall)
 * into the new SA4E-85 webview protocol (STREAM_START/TOKEN/END/ERROR).
 * Tracks active streamId → messageId mappings for correlation.
 */

import * as crypto from 'crypto';
import type { ExtensionMessage } from '../types';
import type {
  IStreamProtocolAdapter,
  EngineStreamEvent,
  StreamChunkEvent,
  StreamCompleteEvent,
  ToolCallEvent,
  ToolCallUpdateEvent,
} from './IStreamProtocolAdapter';

/** Dangerous tools that require user approval before execution */
const DANGEROUS_TOOLS = new Set([
  'write_file', 'stream_write_file', 'shell_execute',
  'delete_file', 'git_commit', 'git_push', 'git_checkout',
]);

/**
 * Concrete adapter: maps old chat:* events → new STREAM_* protocol.
 * Generates a stable messageId per stream for webview correlation.
 */
export class StreamProtocolAdapter implements IStreamProtocolAdapter {
  private readonly streamToMessage = new Map<string, string>();
  private readonly startedStreams = new Set<string>();

  /**
   * Handle a single engine event, returning zero or more ExtensionMessages.
   * @param event - Engine stream event to translate
   * @returns Array of typed messages for the webview
   */
  handleEngineEvent(event: EngineStreamEvent): ExtensionMessage[] {
    switch (event.type) {
      case 'chat:streamChunk':
        return this.handleChunk(event);
      case 'chat:streamComplete':
        return this.handleComplete(event);
      case 'chat:toolCall':
        return this.handleToolCall(event);
      case 'chat:toolCallUpdate':
        return this.handleToolUpdate(event);
      default:
        return [];
    }
  }

  /** @inheritdoc */
  getMessageIdForStream(streamId: string): string | undefined {
    return this.streamToMessage.get(streamId);
  }

  /** @inheritdoc */
  reset(): void {
    this.streamToMessage.clear();
    this.startedStreams.clear();
  }

  /** Translate chat:streamChunk → STREAM_START + STREAM_TOKEN or STREAM_ERROR */
  private handleChunk(event: StreamChunkEvent): ExtensionMessage[] {
    const messages: ExtensionMessage[] = [];
    const isOrphan = !this.streamToMessage.has(event.streamId) && !this.startedStreams.has(event.streamId);
    const messageId = this.ensureMessageId(event.streamId);

    // Emit STREAM_START on first chunk for this stream
    if (!this.startedStreams.has(event.streamId)) {
      this.startedStreams.add(event.streamId);
      messages.push({
        type: 'STREAM_START',
        messageId,
        agentId: event.nodeId,
      });
    }

    if (event.eventType === 'error') {
      messages.push({
        type: 'STREAM_ERROR',
        messageId,
        error: { code: 'ENGINE_ERROR', message: event.content, retryable: true },
      });
      // Orphan errors (no open stream) are one-shot: clean up immediately so
      // synthetic ids never accumulate across turns. Mid-stream errors keep
      // their mapping — the turn's own complete will clean up.
      if (isOrphan) this.cleanup(event.streamId);
    } else if (event.eventType === 'token') {
      messages.push({ type: 'STREAM_TOKEN', messageId, token: event.content });
    }
    // 'status' events are informational — no protocol mapping needed

    return messages;
  }

  /** Translate chat:streamComplete → STREAM_END */
  private handleComplete(event: StreamCompleteEvent): ExtensionMessage[] {
    const messageId = this.ensureMessageId(event.streamId);
    this.cleanup(event.streamId);
    return [{ type: 'STREAM_END', messageId }];
  }

  /** Translate chat:toolCall → TOOL_CALL_REQUEST */
  private handleToolCall(event: ToolCallEvent): ExtensionMessage[] {
    const { id, name, args } = event.toolCall;
    const requiresApproval = DANGEROUS_TOOLS.has(name);
    const toolType = this.classifyTool(name);

    return [{
      type: 'TOOL_CALL_REQUEST',
      toolId: id,
      name,
      args,
      requiresApproval,
      toolType,
    }];
  }

  /**
   * FIX F: translate chat:toolCallUpdate → MCP_TOOL_RESULT.
   * The webview's messageListener runs completeToolCall(toolId, content) /
   * failToolCall(toolId, error) on MCP_TOOL_RESULT — without this mapping the
   * RESPONSE block never leaves "(waiting...)". 'running' emits nothing.
   */
  private handleToolUpdate(event: ToolCallUpdateEvent): ExtensionMessage[] {
    const { id, status, result, duration } = event;
    if (status === 'failed') {
      return [{
        type: 'MCP_TOOL_RESULT',
        toolId: id,
        result: { content: result ?? '', isError: true, duration },
        error: result || 'Tool execution failed',
      }];
    }
    if (status === 'completed') {
      return [{
        type: 'MCP_TOOL_RESULT',
        toolId: id,
        result: { content: result ?? '', isError: false, duration },
      }];
    }
    return [];
  }

  /** Ensure a messageId exists for a given stream; create if new */
  private ensureMessageId(streamId: string): string {
    let messageId = this.streamToMessage.get(streamId);
    if (!messageId) {
      messageId = crypto.randomUUID();
      this.streamToMessage.set(streamId, messageId);
    }
    return messageId;
  }

  /** Clean up tracking state for a completed stream */
  private cleanup(streamId: string): void {
    this.streamToMessage.delete(streamId);
    this.startedStreams.delete(streamId);
  }

  /** Classify tool name into ToolType category for UI */
  private classifyTool(name: string): 'shell' | 'file' | 'mcp' | 'search' | 'browser' {
    // SA4E-336: native 'powershell' (win32) and 'bash' (non-win32) both render
    // as the shell category — no hardcoded bash-only filter (FSD §8 usability).
    if (name.includes('shell') || name.includes('terminal') || name === 'powershell' || name === 'bash') return 'shell';
    if (name.includes('file') || name.includes('write') || name.includes('delete')) return 'file';
    if (name.includes('search') || name.includes('list_directory') || name.includes('grep')) return 'search';
    if (name.includes('browser') || name.includes('fetch')) return 'browser';
    return 'mcp';
  }
}
