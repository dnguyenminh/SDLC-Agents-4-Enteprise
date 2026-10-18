/**
 * Stub ui/ctx factory for pi.dev extensions (SA4E-334 Phase 2).
 * ctx.ui is stubbed to the Chat webview (notify/setStatus fire-and-forget;
 * select/confirm/input explain the webview path instead of hanging).
 */

import { debugLog } from '../../debug-logger';
import type { ChatExtToWebviewMessage } from '../../chat-panel/message-protocol';

export function stubUi(onEvent?: (msg: ChatExtToWebviewMessage) => void) {
  const notify = (message: string, type: 'info' | 'warning' | 'error' = 'info') => {
    try {
      onEvent?.({ type: 'chat:notify', message, level: type } as unknown as ChatExtToWebviewMessage);
    } catch { /* webview may be detached */ }
    debugLog(`[PiExtensionRuntime][ui.notify:${type}] ${message.slice(0, 200)}`);
  };
  const unsupported = async (kind: string) => {
    notify(`Extension asked '${kind}' — please answer directly in the Chat Panel.`, 'warning');
    throw new Error(
      `${kind} needs interactive TUI; in the VS Code Chat Panel answer directly instead.`
    );
  };
  return {
    select: (title: string) => unsupported(`select:${title}`),
    confirm: () => unsupported('confirm'),
    input: () => unsupported('input'),
    notify,
    onTerminalInput: () => () => undefined,
    setStatus: (key: string, text: string | undefined) => debugLog(`[PiExtensionRuntime][status:${key}] ${text ?? ''}`),
    setWorkingMessage: () => undefined,
    setWorkingVisible: () => undefined,
    setWorkingIndicator: () => undefined,
    setHiddenThinkingLabel: () => undefined,
    setWidget: () => undefined,
    setFooter: () => undefined,
    setHeader: () => undefined,
    setTitle: () => undefined,
    custom: () => unsupported('custom'),
    pasteToEditor: () => undefined,
    setEditorText: () => undefined,
    getEditorText: () => '',
    editor: () => unsupported('editor'),
    addAutocompleteProvider: () => undefined,
    setEditorComponent: () => undefined,
    getEditorComponent: () => undefined,
    theme: undefined,
    getAllThemes: () => [],
    getTheme: () => undefined,
    setTheme: () => ({ success: false as const, error: 'themes unsupported in webview' }),
    getToolsExpanded: () => false,
    setToolsExpanded: () => undefined,
  };
}

export function stubCtxFactory(workspaceRoot: string, onEvent?: (msg: ChatExtToWebviewMessage) => void) {
  return () => ({
    cwd: workspaceRoot,
    ui: stubUi(onEvent),
    // Session/model registries are AgentSession-scoped (full migration later).
    // Extensions needing them fail per-execute with a clear error, not a crash.
    sessionManager: undefined,
    modelRegistry: undefined,
  });
}
