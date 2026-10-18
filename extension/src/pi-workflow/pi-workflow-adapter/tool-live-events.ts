/**
 * Forward live tool activity to the sidebar tool-block UI (progress).
 * The webview already renders chat:toolCall/toolCallUpdate — the host
 * just never sent them, so tool-heavy turns looked frozen. Transient
 * only (not persisted to tab history); never throws into the turn.
 *
 * Shared by the session-turn and legacy-turn levels of PiWorkflowAdapter.
 * Extracted from adapter-session-turns.ts (BR-18 file-size split).
 */
import type { ChatExtToWebviewMessage } from '../../chat-panel/message-protocol';
import type { ToolLiveEvent } from '../pi-event-mapper.js';

export function forwardToolLiveEvent(
  onEvent: (msg: ChatExtToWebviewMessage) => void,
  e: ToolLiveEvent
): void {
  try {
    if (e.phase === 'start') {
      onEvent({
        type: 'chat:toolCall',
        toolCall: { id: e.id, name: e.name, args: e.args, status: 'running' },
      } as ChatExtToWebviewMessage);
    } else {
      onEvent({
        type: 'chat:toolCallUpdate',
        id: e.id,
        status: e.isError ? 'failed' : 'completed',
        duration: e.durationMs,
        result: e.result,
      } as ChatExtToWebviewMessage);
    }
  } catch {
    // Progress display must never break turns.
  }
}
