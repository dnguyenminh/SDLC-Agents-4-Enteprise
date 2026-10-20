/**
 * SA4E-85 — Webview-side postMessage sender.
 * Provides typed helper functions for sending WebviewMessage to Extension Host.
 * Wraps the VS Code acquireVsCodeApi() singleton.
 */

import type { WebviewMessage } from '../chat/types';

/** VS Code API interface (acquired once in webview context) */
interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

// Acquire VS Code API singleton (available in webview context)
const vscode: VsCodeApi = (window as any).acquireVsCodeApi
  ? (window as any).acquireVsCodeApi()
  : { postMessage: () => {}, getState: () => null, setState: () => {} };

/**
 * Send a typed message to the Extension Host.
 * All outbound communication from webview flows through this function.
 */
export function postToExtension(message: WebviewMessage): void {
  vscode.postMessage(message);
}

/** Send a user prompt to the selected agent */
export function sendPrompt(text: string, agentId: string, contextFiles?: string[]): void {
  postToExtension({ type: 'SEND_PROMPT', text, agentId, contextFiles });
}

/** Respond to a tool call approval request. Optional rememberPattern auto-approves future matching commands. */
export function respondToolCall(toolId: string, decision: 'APPROVE' | 'REJECT', rememberPattern?: string): void {
  postToExtension({ type: 'TOOL_CALL_RESPONSE', toolId, decision, rememberPattern });
}

/** Dispatch a command to the Extension Host */
export function dispatchCommand(command: string, args?: Record<string, unknown>): void {
  postToExtension({ type: 'COMMAND_DISPATCH', command, args });
}

/** Request terminal command execution */
export function runTerminalCommand(command: string, terminalName: string): void {
  postToExtension({ type: 'RUN_TERMINAL_COMMAND', command, terminalName });
}

/** Accept a code diff */
export function acceptDiff(diffId: string, filePath: string, patch: string): void {
  postToExtension({ type: 'ACTION_ACCEPT_DIFF', diffId, filePath, patch });
}

/** Reject a code diff */
export function rejectDiff(diffId: string): void {
  postToExtension({ type: 'ACTION_REJECT_DIFF', diffId });
}

/** Request patch regeneration after conflict (BR-07) */
export function regeneratePatch(diffId: string, filePath: string): void {
  postToExtension({ type: 'REGENERATE_PATCH', diffId, filePath });
}

/** Unpin a file from context */
export function unpinFile(filePath: string): void {
  postToExtension({ type: 'CONTEXT_UNPIN_FILE', filePath });
}

/** Clear entire context */
export function clearContext(): void {
  postToExtension({ type: 'CONTEXT_CLEAR' });
}

/**
 * SA4E-85 v3.1: Request chat-state hydration on webview mount.
 * Extension resolves the Backend KB thread and replies with SYNC_CHAT_HISTORY.
 */
export function requestSyncState(): void {
  postToExtension({ type: 'REQUEST_SYNC_STATE' });
}

/**
 * SA4E-183: Request diff summary from extension host.
 * Extension replies with DIFF_SUMMARY_RESPONSE message.
 */
export function requestDiffSummary(): void {
  postToExtension({ type: 'COMMAND_DISPATCH', command: 'diff' });
}

/**
 * SA4E-183: Request to open a file in the diff editor.
 * Extension handles opening the file or showing diff view.
 * @param filePath - Workspace-relative file path
 * @param operation - File operation type for display logic
 */
export function openDiffFile(filePath: string, operation: 'added' | 'modified' | 'deleted'): void {
  postToExtension({ type: 'DIFF_OPEN_FILE', filePath, operation });
}

/** SA4E-370 S3: Switch active tab */
export function switchTab(tabId: string): void {
  postToExtension({ type: 'tab:switch', payload: { tabId } });
}

/** SA4E-370 S3: Create new tab */
export function createTab(tab: { id: string; name: string; messages: unknown[]; tokenCount: number; maxTokens: number }): void {
  postToExtension({ type: 'tab:create', payload: { tab } });
}

/** SA4E-370 S3: Close tab */
export function closeTab(tabId: string): void {
  postToExtension({ type: 'tab:close', payload: { tabId } });
}

/** SA4E-370 S3: Rename tab */
export function renameTab(tabId: string, newName: string): void {
  postToExtension({ type: 'tab:rename', payload: { tabId, newName } });
}
