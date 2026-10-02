/**
 * SA4E-85 — IStreamProtocolAdapter interface.
 * Defines the contract for translating LangGraph stream events
 * to the new SA4E-85 message protocol (STREAM_START/TOKEN/END/ERROR).
 */

import type { ExtensionMessage } from '../types';

/**
 * Translates engine stream events to the new webview protocol.
 * Decouples LangGraph event format from webview message format.
 */
export interface IStreamProtocolAdapter {
  /** Handle a raw engine event and produce typed ExtensionMessages */
  handleEngineEvent(event: EngineStreamEvent): ExtensionMessage[];

  /** Get the active message ID for a given stream */
  getMessageIdForStream(streamId: string): string | undefined;

  /** Reset state between sessions */
  reset(): void;
}

/** Union of engine events consumed by the adapter */
export type EngineStreamEvent =
  | StreamChunkEvent
  | StreamCompleteEvent
  | ToolCallEvent
  | ToolCallUpdateEvent;

/** Token/status/error chunk from chat:streamChunk */
export interface StreamChunkEvent {
  type: 'chat:streamChunk';
  streamId: string;
  nodeId: string;
  eventType: 'token' | 'status' | 'error';
  content: string;
  timestamp: string;
}

/** Stream completion from chat:streamComplete */
export interface StreamCompleteEvent {
  type: 'chat:streamComplete';
  streamId: string;
  nodeId: string;
  finalContent: string;
}

/** Tool call request from chat:toolCall */
export interface ToolCallEvent {
  type: 'chat:toolCall';
  toolCall: {
    id: string;
    name: string;
    args: Record<string, unknown>;
    status: string;
  };
}

/** FIX F: tool progress/result from chat:toolCallUpdate — carries the output text */
export interface ToolCallUpdateEvent {
  type: 'chat:toolCallUpdate';
  id: string;
  status: 'running' | 'completed' | 'failed';
  result?: string;
  duration?: number;
}
