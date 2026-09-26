import type { AgentEvent } from '@earendil-works/pi-agent-core';
import type { ToolCall } from './pi-provider.js';
import type { PiStreamChunk } from './pi-provider.js';

export interface EventCollector {
  chunks: PiStreamChunk[];
  toolCalls: ToolCall[];
  text: string;
  errorMessage?: string;
}

/**
 * FIX E: pure event→chunk mapping for the Agent subscribe loop.
 * Extracted from PiProvider to keep the provider within the 200-line standard.
 */
export function mapAgentEvent(event: AgentEvent, collector: EventCollector): void {
  if (event.type === 'message_update') {
    const ame = event.assistantMessageEvent;
    if (ame && ame.type === 'text_delta' && ame.delta) {
      collector.text += ame.delta;
      collector.chunks.push({ type: 'text', content: ame.delta });
    }
    return;
  }
  if (event.type === 'tool_execution_start') {
    const tc: ToolCall = {
      id: event.toolCallId,
      name: event.toolName,
      arguments: (event.args ?? {}) as Record<string, unknown>,
    };
    collector.toolCalls.push(tc);
    collector.chunks.push({ type: 'tool_call', toolCall: tc });
    return;
  }
  if (event.type === 'tool_execution_end' && event.isError) {
    const msg = `Tool '${event.toolName}' failed`;
    collector.errorMessage = collector.errorMessage || msg;
    collector.chunks.push({ type: 'error', error: msg });
  }
}
