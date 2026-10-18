/**
 * SA4E-85 — ChatEngineAdapter (Task 1).
 * Adapter pattern: bridges src/chat/ MessageRouter to LangGraphEngine.
 * Registers message handlers for all WebviewMessage types and subscribes
 * to engine stream events, translating them via StreamProtocolAdapter.
 * Deps contract, event mapping, and hydration live in ./ChatEngineAdapter/*.
 */

import * as vscode from 'vscode';
import type { WebviewMessage, ExtensionMessage } from '../types';
import type { DiffBlock } from '../tools/diffTypes';
import type { IChatEngineAdapter } from './IChatEngineAdapter';
import type { ChatExtToWebviewMessage } from '../../chat-panel/message-protocol';
import { StreamEventMapper } from './ChatEngineAdapter/event-mapper';
import { handleSendPromptWithSession, handleRequestSyncState } from './ChatEngineAdapter/hydration';
import type { ChatEngineAdapterDeps } from './ChatEngineAdapter/deps';

export type { ChatEngineAdapterDeps } from './ChatEngineAdapter/deps';

/**
 * Concrete adapter: connects MessageRouter handlers to LangGraphEngine.
 * Each WebviewMessage type maps to an engine action via Strategy dispatch.
 */
export class ChatEngineAdapter implements IChatEngineAdapter {
  private readonly deps: ChatEngineAdapterDeps;
  private connected = false;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly eventMapper = new StreamEventMapper();

  constructor(deps: ChatEngineAdapterDeps) {
    this.deps = deps;
  }

  /** Register all message handlers and wire engine event listener */
  initialize(): void {
    this.registerMessageHandlers();
    this.connected = true;
  }

  /** @inheritdoc */
  isConnected(): boolean {
    return this.connected;
  }

  /** @inheritdoc */
  dispose(): void {
    this.connected = false;
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
  }

  /** Register a handler for each WebviewMessage type in the router */
  private registerMessageHandlers(): void {
    const { router } = this.deps;

    router.registerHandler('SEND_PROMPT', (msg) => this.handleSendPrompt(msg));
    router.registerHandler('TOOL_CALL_RESPONSE', (msg) => this.handleToolCallResponse(msg));
    router.registerHandler('COMMAND_DISPATCH', (msg) => this.handleCommandDispatch(msg));
    router.registerHandler('ACTION_ACCEPT_DIFF', (msg) => this.handleAcceptDiff(msg));
    router.registerHandler('ACTION_REJECT_DIFF', (msg) => this.handleRejectDiff(msg));
    router.registerHandler('CONTEXT_UNPIN_FILE', (msg) => this.handleUnpinFile(msg));
    router.registerHandler('CONTEXT_CLEAR', () => this.handleClearContext());
    router.registerHandler('RUN_TERMINAL_COMMAND', (msg) => this.handleRunTerminal(msg));
    router.registerHandler('REGENERATE_PATCH', (msg) => this.handleRegenerate(msg));
    // SA4E-186: Dual-path agent selection — ChatEngineAdapter handles SELECT_AGENT
    router.registerHandler('SELECT_AGENT', async (msg) => this.handleSelectAgent(msg));
    // SA4E-85 v3.1: webview mounts → request state hydration from Backend KB
    router.registerHandler('REQUEST_SYNC_STATE', () => this.handleRequestSyncState());
  }

  /** Forward translated ExtensionMessages to webview via bridge */
  private sendToWebview(messages: ExtensionMessage[]): void {
    for (const msg of messages) {
      this.deps.bridge.postToWebview(msg);
    }
  }

  /**
   * Handle engine event from LangGraphEngine onEvent callback.
   * Called externally when engine emits a ChatExtToWebviewMessage.
   * @param event - Raw engine event to translate
   */
  handleEngineEvent(event: ChatExtToWebviewMessage): void {
    const streamEvent = this.eventMapper.map(event);
    if (!streamEvent) return;

    const messages = this.deps.streamAdapter.handleEngineEvent(streamEvent);
    this.sendToWebview(messages);
  }

  // --- Handler implementations ---

  private async handleSendPrompt(payload: unknown): Promise<void> {
    const msg = payload as Extract<WebviewMessage, { type: 'SEND_PROMPT' }>;
    await handleSendPromptWithSession(this.deps, msg.text, (m) => this.sendToWebview(m));
  }

  private async handleRequestSyncState(): Promise<void> {
    await handleRequestSyncState(this.deps, (m) => this.sendToWebview(m));
  }

  private async handleToolCallResponse(payload: unknown): Promise<void> {
    const msg = payload as Extract<WebviewMessage, { type: 'TOOL_CALL_RESPONSE' }>;
    const decision = msg.decision === 'APPROVE' ? 'approve' : 'reject';

    // Store pattern for future auto-approve if user opted in
    if (decision === 'approve' && msg.rememberPattern && this.deps.commandPatternMatcher) {
      this.deps.commandPatternMatcher.addPattern(msg.rememberPattern);
    }

    // SA4E-85: Resolve pending approval gate if available (unblocks executeSingleTool)
    if (this.deps.approvalGate) {
      this.deps.approvalGate.resolveApproval(msg.toolId, decision);
    }

    await this.deps.engine.handleApproval(decision as any);
  }

  private async handleCommandDispatch(payload: unknown): Promise<void> {
    const msg = payload as Extract<WebviewMessage, { type: 'COMMAND_DISPATCH' }>;
    await vscode.commands.executeCommand(msg.command, msg.args);
  }

  private async handleAcceptDiff(payload: unknown): Promise<void> {
    const msg = payload as Extract<WebviewMessage, { type: 'ACTION_ACCEPT_DIFF' }>;
    const diff: DiffBlock = {
      diffId: msg.diffId,
      filePath: msg.filePath,
      patch: msg.patch,
      fileHashAtGeneration: '',
      generatedAt: Date.now(),
      status: 'pending',
    };
    await this.deps.toolHandler.applyDiff(diff);
  }

  private async handleRejectDiff(payload: unknown): Promise<void> {
    const msg = payload as Extract<WebviewMessage, { type: 'ACTION_REJECT_DIFF' }>;
    this.deps.toolHandler.rejectDiff(msg.diffId);
  }

  private async handleUnpinFile(payload: unknown): Promise<void> {
    const msg = payload as Extract<WebviewMessage, { type: 'CONTEXT_UNPIN_FILE' }>;
    this.deps.contextManager.unpinFile(msg.filePath);
  }

  private async handleClearContext(): Promise<void> {
    this.deps.contextManager.clearAll();
  }

  private async handleRunTerminal(payload: unknown): Promise<void> {
    const msg = payload as Extract<WebviewMessage, { type: 'RUN_TERMINAL_COMMAND' }>;
    this.deps.toolHandler.runTerminalCommand(msg.command, msg.terminalName);
  }

  private async handleRegenerate(payload: unknown): Promise<void> {
    const msg = payload as Extract<WebviewMessage, { type: 'REGENERATE_PATCH' }>;
    await this.deps.toolHandler.regeneratePatch(msg.diffId, msg.filePath);
  }

  /**
   * SA4E-186: Handle SELECT_AGENT — dual-path routing.
   * Delegates to engine.selectAgent() and sends AGENT_SWITCHED confirmation to webview.
   */
  private handleSelectAgent(payload: unknown): void {
    const msg = payload as Extract<WebviewMessage, { type: 'SELECT_AGENT' }>;
    const result = this.deps.engine.selectAgent(msg.agentId);
    this.sendToWebview([{
      type: 'AGENT_SWITCHED',
      agentId: result.agentId,
      agentName: result.agentName,
    }]);
  }
}
