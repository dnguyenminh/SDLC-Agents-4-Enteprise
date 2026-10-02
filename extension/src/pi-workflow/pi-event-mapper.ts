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
 * Live tool-activity event forwarded to the chat UI (progress display).
 * The sidebar already renders chat:toolCall/toolCallUpdate blocks — the
 * host just never sent them, so long tool-heavy turns looked frozen.
 */
export interface ToolLiveEvent {
  phase: 'start' | 'end';
  id: string;
  name: string;
  args?: Record<string, unknown>;
  isError?: boolean;
  durationMs?: number;
  /** FIX F: tool output text from tool_execution_end.result (end phase only). */
  result?: string;
}

/** FIX F: cap for tool output forwarded to the webview (postMessage + render safety). */
export const MAX_TOOL_RESULT_CHARS = 16000;

function capResult(s: string): string {
  return s.length > MAX_TOOL_RESULT_CHARS
    ? `${s.slice(0, MAX_TOOL_RESULT_CHARS)}\n… [truncated ${s.length - MAX_TOOL_RESULT_CHARS} chars]`
    : s;
}

/**
 * FIX F: extract display text from a tool_execution_end `result`.
 * SDK shape (pi-agent-core AgentToolResult): `{ content: (TextContent|ImageContent)[] }`.
 * Defensive against drift: also accepts plain-string content/items/results.
 * Returns undefined when there is nothing textual to show.
 */
export function extractToolResultText(result: unknown): string | undefined {
  if (result == null) return undefined;
  if (typeof result === 'string') return capResult(result);
  const content = (result as { content?: unknown }).content;
  if (typeof content === 'string') return capResult(content);
  if (!Array.isArray(content)) return undefined;
  const parts: string[] = [];
  for (const item of content) {
    if (typeof item === 'string') {
      parts.push(item);
      continue;
    }
    if (item && typeof item === 'object') {
      const text = (item as { text?: unknown }).text;
      if (typeof text === 'string') parts.push(text);
    }
  }
  const joined = parts.join('\n').trim();
  return joined ? capResult(joined) : undefined;
}

/**
 * Correlates tool_execution_start/end agent events into UI-ready events.
 * Pure + stateful per turn; never throws (defensive against SDK shape drift).
 */
export class ToolEventTracker {
  private readonly startedAt = new Map<string, number>();

  observe(event: AgentEvent): ToolLiveEvent | undefined {
    try {
      const type = (event as { type?: string }).type;
      if (type === 'tool_execution_start') {
        const e = event as { toolCallId?: unknown; toolName?: unknown; args?: unknown };
        const id = String(e.toolCallId ?? '');
        if (!id) return undefined;
        this.startedAt.set(id, Date.now());
        const args =
          e.args && typeof e.args === 'object' ? (e.args as Record<string, unknown>) : undefined;
        return { phase: 'start', id, name: String(e.toolName ?? '?'), args };
      }
      if (type === 'tool_execution_end') {
        const e = event as { toolCallId?: unknown; toolName?: unknown; isError?: unknown; result?: unknown };
        const id = String(e.toolCallId ?? '');
        if (!id || !this.startedAt.has(id)) return undefined;
        const started = this.startedAt.get(id) as number;
        this.startedAt.delete(id);
        return {
          phase: 'end',
          id,
          name: String(e.toolName ?? '?'),
          isError: e.isError === true,
          durationMs: Date.now() - started,
          result: extractToolResultText(e.result),
        };
      }
    } catch {
      // A progress tracker must never break the turn.
    }
    return undefined;
  }
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
  // BUG H: a failed tool intentionally produces NO message-level error chunk
  // and does NOT set collector.errorMessage. The failure already travels via
  // ToolEventTracker → chat:toolCallUpdate{isError} → MCP_TOOL_RESULT{error},
  // rendering inside the tool's own RESPONSE block. Pushing an error chunk
  // here became a red STREAM_ERROR bubble per failed tool, and errorMessage
  // failed the whole turn (PI_EXECUTION_ERROR + spurious model-fallback
  // check). Genuine turn-fatal errors surface via agent.state.errorMessage.
}
