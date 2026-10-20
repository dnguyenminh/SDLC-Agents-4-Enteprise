/**
 * PiWorkflowAdapter — legacy engine-path turn execution (SA4E-333/334/355).
 * Governed (context-budget) turns run through PiWorkflowEngine with the
 * workspace tool pool; every failure surfaces as an actionable chat error.
 */
import * as crypto from 'node:crypto';
import type { PipelineState } from '../types/pi-workflow-state.js';
import type { ChatExtToWebviewMessage } from '../../chat-panel/message-protocol';
import { buildWorkspaceSystemPrompt } from '../pi-coding-tools.js';
import { runContextPipeline } from '../pi-context-pipeline.js';
import { getExtensionVersion } from '../pi-provider-config-bridge.js';
import { isBudgetExceededError } from '../../pi-agent/budget-gate.js';
import { governLegacyTurn } from '../legacy-turn-governance.js';
import { debugLog, debugError } from '../../debug-logger';
import * as vscode from 'vscode';
import { assembleLegacyToolPool, configureEngineProvider, replayTurnChunks, reportTurnError, resolveTurnBudget } from './adapter-legacy-helpers.js';
import { AdapterSessionTurns } from './adapter-session-turns.js';

export class AdapterLegacyTurns extends AdapterSessionTurns {
  /**
   * SA4E-355 UAT fix #1: runs the legacy-turn governance gate. Detects the
   * context window (fix #3: meta.n_ctx probe → registry chain) and measures
   * the full request before the provider is ever called.
   * Returns the governed (compacted) history, or null when the turn was
   * REJECTED — the actionable chat:error has been emitted and the caller must
   * stop the turn (BR-09).
   */
  private async governLegacyTurnOrReject(
    state: PipelineState,
    chatInput: string,
    systemPrompt: string,
    tools: unknown[]
  ): Promise<{ history: Array<{ role: string; content: string }> } | null> {
    try {
      await this.detectContextWindowEarly();
      const config = vscode.workspace?.getConfiguration?.('sdlcAgents');
      // BR-01 window chain: probe meta.n_ctx → runtime (pi-ai) model registry —
      // the resolved model's real window (gateway models carry context_length /
      // meta.n_ctx parsed at registration). resolveContextBudget appends the
      // static registry → default fallbacks when both are absent.
      const runtimeWindow = this.engine.getProvider().getModelContextWindow?.();
      // SA4E-355 UAT bug 2: share the resolved BR-01 top link with the
      // provider — the intra-turn streamFn gate must measure EVERY LLM
      // request against the SAME budget chain as this turn-start gate.
      this.engine.getProvider().setDetectedContextWindow?.(this.getDetectedContextWindow() ?? runtimeWindow);
      return governLegacyTurn({
        systemPrompt,
        history: state.chatHistory ?? [],
        chatInput,
        tools,
        modelId: config?.get?.<string>('llmModel', '') || '',
        nCtxDetected: this.getDetectedContextWindow() ?? runtimeWindow,
      });
    } catch (err) {
      if (!isBudgetExceededError(err)) throw err;
      // SA4E-355 (BR-09/STC-307 parity): a REJECT claims the turn — the
      // actionable chat:error is the ONLY output; the provider is never called.
      this.onEvent({
        type: 'chat:error',
        code: 'PI_CONTEXT_BUDGET_EXCEEDED',
        message: (err as Error).message,
        retryable: false,
      } as ChatExtToWebviewMessage);
      return null;
    }
  }

  protected async runTurnOnce(state: PipelineState, chatInput: string, ticketKey: string): Promise<void> {
    try {
      const { timeoutMs: chatTimeoutMs, maxSameToolRepeats: maxRepeatsRaw } = resolveTurnBudget();
      const turnBudget = {
        timeoutMs: chatTimeoutMs,
        maxSameToolRepeats: maxRepeatsRaw,
      };
      // SA4E-334 Option A: AgentSession-first (real .jsonl + sidecar pairing).
      // MUST run before legacy configurePiProvider gating — the legacy gate
      // rejects providers the session path can serve (and vice versa).
      // Falls back to the legacy engine path below on any failure.
      // turnStreamId (below) is the single identity for every stream event.
      const turnStreamId = crypto.randomUUID();
      // SA4E-370 S2: role from active agent for this tab, not hardcoded 'sm-agent'.
      // Falls back to 'sm-agent' when no agent is selected (backward compat).
      const tabId = this.store.activeTab || 'CHAT';
      const active = this.activeAgents.get(tabId);
      const sessionRole = active?.role || 'sm-agent';
      if (await this.trySessionTurn(state, chatInput, ticketKey, sessionRole, chatTimeoutMs, turnStreamId)) return;
      // FIX A + B: initialize + seed credentials + register gateway + resolve model (correct order).
      const { modelUnresolved, credentialsPresent } = await configureEngineProvider(this.engine, this.secrets);
      // FIX C: PI_MODEL_UNRESOLVED only for the true no-model case (registry has no model).
      if (modelUnresolved) {
        this.onEvent({
          type: 'chat:error', code: 'PI_MODEL_UNRESOLVED',
          message: 'No usable Pi model resolved for this provider. Set sdlcAgents.llmModel to a real registry id, then retry.',
          retryable: true,
        } as ChatExtToWebviewMessage);
        return;
      }
      // FIX C: model resolved but no API key → distinct credentials error (fail-closed).
      if (!credentialsPresent) {
        const providerId = vscode.workspace?.getConfiguration?.('sdlcAgents')?.get?.<string>('llmProvider', 'anthropic') || 'anthropic';
        this.onEvent({
          type: 'chat:error', code: 'PI_CREDENTIALS_MISSING',
          message: `No API key for '${providerId}'. Set sdlcAgents.${providerId}ApiKey in Settings, then retry.`,
          retryable: true,
        } as ChatExtToWebviewMessage);
        return;
      }
      // SA4E-333/334 legacy path: workspace-aware tools + systemPrompt.
      // (Session-first already ran at the top of this method.)
      const systemPrompt = buildWorkspaceSystemPrompt(this.workspaceRoot);
      const { tools, byName } = await assembleLegacyToolPool(this.workspaceRoot, this.mcpBridge, (msg) => this.onEvent(msg));
      const workspaceRoot = this.workspaceRoot;
      const onEvent = (msg: ChatExtToWebviewMessage) => this.onEvent(msg);
      // SA4E-355 UAT fix #1: govern the LEGACY turn before any provider call —
      // the full request (system + accumulated history + prompt + tool schemas)
      // is measured against the resolved budget (fix #3: detected meta.n_ctx →
      // registry chain). Over-budget turns compact history; still-over turns
      // REJECT with PI_CONTEXT_BUDGET_EXCEEDED and the provider is never invoked.
      const governed = await this.governLegacyTurnOrReject(state, chatInput, systemPrompt, tools as unknown[]);
      if (!governed) return;
      const { result, nextState } = await this.engine.executeTurn(
        { ...state, chatHistory: governed.history },
        chatInput,
        sessionRole,
        {
          tools,
          systemPrompt,
          contextRunner: (msgs) => runContextPipeline(workspaceRoot, msgs, onEvent),
          turnBudget,
          onToolEvent: (e) => this.postToolLiveEvent(e),
        }
      );
      debugLog(`[Chat] turn via=legacy ext=${getExtensionVersion()} workspace=${this.workspaceRoot} tools=${byName.size} used=${result.toolCalls.length} systemPrompt=${systemPrompt.length}ch`);
      this.store.save(ticketKey, nextState as PipelineState);
      this.store.setHistory(nextState.chatHistory || []);
      const turnStart = Date.now();
      replayTurnChunks(this.streamHandler, result.streamChunks || [], turnStreamId);
      // ⛔ ROOT-CAUSE FIX (SA4E-289) + streaming-identity fix: ALWAYS close the
      // stream with the SAME turnStreamId — even textless (tool-only) turns
      // opened a bubble that must be closed, or the cursor blinks forever.
      this.streamHandler.emitComplete('pi', Date.now() - turnStart, turnStreamId);
      if (result.error) {
        // Local endpoints: enrich raw HTTP errors with the endpoint checklist
        // (UAT otherwise gets an bare "HTTP 401" with nothing actionable).
        reportTurnError((msg) => this.onEvent(msg), result.error);
      }
    } catch (err) {
      debugError('[PiWorkflowAdapter] turn failed', err as Error);
      this.onEvent({ type: 'chat:error', code: 'PI_TURN_FAILED', message: (err as Error).message, retryable: true } as ChatExtToWebviewMessage);
    }
  }
}
