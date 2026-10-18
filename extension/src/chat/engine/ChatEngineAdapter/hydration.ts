/**
 * Session hydration handlers for ChatEngineAdapter (SA4E-85 v3.1).
 * SEND_PROMPT session-ensure + REQUEST_SYNC_STATE webview-mount hydration.
 */

import type { ExtensionMessage } from '../../types';
import type { ChatEngineAdapterDeps } from './deps';

type SendFn = (messages: ExtensionMessage[]) => void;

/** SEND_PROMPT: ensure the Backend KB session (non-fatal), then invoke the engine. */
export async function handleSendPromptWithSession(
  deps: ChatEngineAdapterDeps,
  text: string,
  sendToWebview: SendFn,
): Promise<void> {
  try {
    await deps.sessionManager.ensureSession();
  } catch (err) {
    // Backend KB is optional for local-first PI turns — warn and continue
    // with the PI engine instead of blocking the chat (UAT without backend).
    sendToWebview([{
      type: 'STREAM_ERROR',
      messageId: 'session',
      error: { code: 'KB_UNREACHABLE_WARN', message: `Backend session unavailable, continuing locally: ${(err as Error).message}`, retryable: false },
    }]);
  }
  await deps.engine.invokeChat(text);
}

/**
 * SA4E-85 v3.1: Webview mount hydration.
 * Resolves the current Backend KB thread + message history and pushes
 * SYNC_CHAT_HISTORY so the webview chatStore rehydrates (multi-IDE hydrate).
 */
export async function handleRequestSyncState(
  deps: ChatEngineAdapterDeps,
  sendToWebview: SendFn,
): Promise<void> {
  try {
    const hydrated = await deps.sessionManager.getSessionMessages();
    // STC API-HYD-02 step 7: empty history still hydrates with messages=[] (never undefined)
    if (!hydrated) { return; }
    // TDD §4.1 / STC API-HYD-02: SYNC_CHAT_HISTORY carries context snapshot
    const state = deps.contextManager.getState();
    const context = {
      tokenCount: state.tokenCount,
      maxTokens: state.maxTokens,
      files: state.files.map((f) => ({ path: f.filePath, tokenCount: f.tokenCount, pinned: true })),
    };
    deps.bridge.postToWebview({
      type: 'SYNC_CHAT_HISTORY',
      threadId: hydrated.threadId,
      messages: hydrated.messages,
      context,
    });
  } catch (err) {
    // Non-fatal: webview keeps an empty state, user can retry by sending a message
    sendToWebview([{
      type: 'STREAM_ERROR',
      messageId: 'sync',
      error: { code: 'SYNC_STATE_FAILED', message: `Failed to hydrate chat state: ${(err as Error).message}`, retryable: true },
    }]);
  }
}
