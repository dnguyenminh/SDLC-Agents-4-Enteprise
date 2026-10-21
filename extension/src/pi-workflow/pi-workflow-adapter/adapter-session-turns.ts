/**
 * PiWorkflowAdapter — session-first turn routing (SA4E-334 Option A).
 * Serializes turns, forwards live tool activity, routes each turn through a
 * real AgentSession, and falls back to the legacy engine path on failure.
 */
import type { PipelineState } from '../types/pi-workflow-state.js';
import type { ChatExtToWebviewMessage } from '../../chat-panel/message-protocol';
import type { ToolLiveEvent } from '../pi-event-mapper.js';
import { providerRequiresApiKey, getExtensionVersion, buildCredentialResolver } from '../pi-provider-config-bridge.js';
import { PROVIDER_BASE_URL_KEYS, PROVIDER_BASE_URL_LEGACY_KEYS } from '../../models/LlmProviderConfig';
import { getSettingWithFallback } from '../../config/settings-migration.js';
import { isBudgetExceededError } from '../../pi-agent/budget-gate.js';
import { debugLog } from '../../debug-logger';
import { AdapterCore } from './adapter-core.js';
import { forwardToolLiveEvent } from './tool-live-events.js';
import { notifyPeerUserActivity } from '../peer/lifecycle.js';
import { peerApprovalGateOrUndefined } from '../peer/runtime.js';

export abstract class AdapterSessionTurns extends AdapterCore {
  /** Implemented by the legacy-path level (./adapter-legacy-turns.ts). */
  protected abstract runTurnOnce(state: PipelineState, chatInput: string, ticketKey: string): Promise<void>;

  /** LangGraphEngine-compatible: invoke(ticketKey, phase, chatInput, intent?, autonomyLevel?) */
  async invoke(ticketKey: string, phase: string, chatInput: string, _intent?: unknown, _autonomyLevel?: unknown): Promise<void> {
    const state = this.store.stateFor(ticketKey);
    state.currentPhase = phase || state.currentPhase;
    state.chatHistory = this.store.getHistory() || state.chatHistory;
    await this.runTurn(state, chatInput, ticketKey);
  }

  async invokeChat(chatInput: string): Promise<void> {
    const tab = this.store.activeTab || 'CHAT';
    const state = this.store.get(tab) || this.store.chatStateFor(tab);
    await this.runTurn(state, chatInput, state.ticketKey);
  }

  private async runTurn(state: PipelineState, chatInput: string, ticketKey: string): Promise<void> {
    // S-01(3)/BR-9: any user msg resets the anti-loop chains of the tab (both invoke + invokeChat
    // flows, keyed by the SAME tab key the peer registry uses). Wraps in try/catch — never throws.
    notifyPeerUserActivity(this.store.activeTab || 'CHAT');
    // CONCURRENCY-FIX: serialize turns. A second invokeChat while one is still running is queued
    // (runs after the current one) and surfaced as a non-fatal notice — never dropped, never overlapped.
    if (this.turnInFlight) {
      this.onEvent({
        type: 'chat:workingStatus',
        working: true,
        label: 'Finishing previous message — your message is queued next.',
      } as ChatExtToWebviewMessage);
    }
    const prev = this.turnInFlight ?? Promise.resolve();
    const exec = prev.catch(() => {}).then(() => this.runTurnOnce(state, chatInput, ticketKey));
    this.turnInFlight = exec.finally(() => {
      if (this.turnInFlight === exec) this.turnInFlight = undefined;
    });
    return this.turnInFlight;
  }

  /** Forward live tool activity to the sidebar tool-block UI (see ./tool-live-events.ts). */
  protected postToolLiveEvent(e: ToolLiveEvent): void {
    forwardToolLiveEvent(this.onEvent, e);
  }

  /**
   * SA4E-334 Option A: route the turn through a real AgentSession
   * (workspace-local .jsonl transcript so billion-context pairs its
   * .acp.json sidecar). Returns true when the session handled the turn.
   * Any failure returns false and the caller uses the legacy engine path.
   *
   * Routing: session-first ONLY for key-requiring (cloud) providers with a
   * real key. Local endpoints (lmstudio/ollama/onnx) ALWAYS use the legacy
   * gateway path — pi-ai has no builtin provider for them and ModelRuntime
   * cannot compose auth ("Provider is not configured"), while legacy
   * createGatewayProvider builds a complete OpenAI-compatible provider
   * (real /v1/models + Chat Completions) that works keyless.
   */
  protected async trySessionTurn(
    state: PipelineState,
    chatInput: string,
    ticketKey: string,
    role: string,
    timeoutMs = 0,
    turnStreamId: string
  ): Promise<boolean> {
    // One stable stream identity per turn (streaming-identity fix).
    const turnStart = Date.now();
    try {
      // SA4E-370: renamed keys resolved with legacy-key fallback.
      const providerId = getSettingWithFallback<string>('llm.provider', 'llmProvider', 'anthropic') || 'anthropic';
      if (!providerRequiresApiKey(providerId)) return false; // local → legacy gateway path
      const baseUrlKey = PROVIDER_BASE_URL_KEYS[providerId];
      const baseUrl = (baseUrlKey
        ? getSettingWithFallback<string>(baseUrlKey, PROVIDER_BASE_URL_LEGACY_KEYS[providerId], '')
        : '') || undefined;
      const configuredModelId = getSettingWithFallback<string>('llm.model', 'llmModel', '') || '';
      const resolver = this.secrets ? buildCredentialResolver(this.secrets) : undefined;
      const apiKey = resolver ? await resolver(providerId) : undefined;
      // Key-requiring providers without a key keep the fail-closed
      // PI_CREDENTIALS_MISSING error on the legacy path below.
      if (!apiKey) return false;
      // SA4E-355 Task 5.1 (BR-12/STC-309): detect n_ctx BEFORE the host
      // assembles static context — the resolver chain needs it first (UC-01).
      await this.detectContextWindowEarly();
      const { ensureSessionHost } = await import('../pi-agent-session-host.js');
      const tabId = this.store.activeTab || 'CHAT';
      const host = await ensureSessionHost({
        workspaceRoot: this.workspaceRoot,
        tabId, // SA4E-370 S3: per-tab session key workspaceRoot+tabId
        providerId,
        apiKey,
        baseUrl,
        configuredModelId,
        role, // UC-02/UC-04: executeTurn role drives skills + loadout scoping
        phase: state.currentPhase, // UC-02: steering map (unmapped → shared-* only)
        nCtxDetected: this.getDetectedContextWindow(), // UC-01 (absent → fail-open chain)
        mcpBridge: this.mcpBridge, // SA4E-360 §6.4: skeleton supply + read_method (absent ⇒ degraded)
        // S-02(a): EVERY host creation carries the fail-closed peer approval gate —
        // the host cache is first-winner; without it a user-path creation would
        // strand the host and instantly block peer tool calls (never bypass).
        peerApprovalGate: peerApprovalGateOrUndefined(),
      });
      // One stable stream identity per turn (streaming-identity fix):
      // every token/complete/error of this turn shares turnStreamId so the
      // webview opens exactly ONE bubble and always closes it.
      // Session turns have no in-loop abort (AgentSession API) — bound the
      // wait instead. Late completions are dropped via live=false so a timed
      // out session can never bleed tokens into a later turn. Timeout claims
      // the turn (return true) to avoid double-executing via legacy fallback.
      const streamId = turnStreamId;
      let live = true;
      // timeoutMs <= 0 → NO wall-clock backstop (product decision: stop only on
      // repetition, never elapsed time). Only race a timeout when opt-in (>0).
      const promptPromise = host.promptTurn(
        chatInput,
        (token) => {
          if (!live) return;
          this.streamHandler.emitToken('pi', token, streamId);
        },
        (e) => {
          if (!live) return;
          this.postToolLiveEvent(e);
        },
        // SA4E-THINKING: reasoning deltas stream into the webview ThinkingBlock.
        (token) => {
          if (!live) return;
          this.streamHandler.emitThinking('pi', token, streamId);
        }
      );
      let res;
      try {
        if (timeoutMs > 0) {
          const timeout = new Promise<never>((_, reject) => {
            const t = setTimeout(
              () => reject(new Error(`PI_SESSION_TIMEOUT after ${timeoutMs}ms`)),
              timeoutMs
            );
            (t as unknown as { unref?: () => void }).unref?.();
          });
          res = await Promise.race([promptPromise, timeout]);
        } else {
          res = await promptPromise;
        }
      } catch (err) {
        live = false;
        if ((err as Error).message.startsWith('PI_SESSION_TIMEOUT')) {
          this.streamHandler.emitComplete('pi', Date.now() - turnStart, streamId);
          this.onEvent({
            type: 'chat:error',
            code: 'PI_SESSION_TIMEOUT',
            message: `Session turn timed out after ${Math.round(timeoutMs / 1000)}s. Narrow the scope and retry.`,
            retryable: true,
          } as ChatExtToWebviewMessage);
          return true;
        }
        throw err;
      }
      // Always close the stream, even for textless turns (tool-only output
      // still opened a bubble that must be closed).
      this.streamHandler.emitComplete('pi', Date.now() - turnStart, streamId);
      // Mirror the turn into the lightweight store (context usage + fallback coherence).
      const history = [...(this.store.getHistory() || state.chatHistory || [])];
      history.push({ role: 'user', content: chatInput } as never);
      if (res.text) history.push({ role: 'assistant', content: res.text } as never);
      this.store.setHistory(history as never);
      this.store.save(ticketKey, { ...state, chatHistory: history } as PipelineState);
      if (res.sessionFile) {
        debugLog(`[Chat] turn via=session ext=${getExtensionVersion()} workspace=${this.workspaceRoot} file=${res.sessionFile} tools=${res.toolCalls.length} text=${res.text.length}ch`);
      }
      return true;
    } catch (err) {
      // SA4E-355 Task 5 (BR-09/STC-307): a gate REJECT claims the turn — the
      // actionable chat:error is the ONLY output and the legacy engine (hence
      // the provider) is NEVER invoked with the oversized prompt.
      if (isBudgetExceededError(err)) {
        this.streamHandler.emitComplete('pi', Date.now() - turnStart, turnStreamId);
        this.onEvent({
          type: 'chat:error',
          code: 'PI_CONTEXT_BUDGET_EXCEEDED',
          message: (err as Error).message,
          retryable: false,
        } as ChatExtToWebviewMessage);
        return true;
      }
      debugLog(`[PiWorkflowAdapter] session turn fallback: ${(err as Error).message.slice(0, 160)}`);
      return false;
    }
  }
}
