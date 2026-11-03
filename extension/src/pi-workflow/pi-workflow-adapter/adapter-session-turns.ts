/**
 * PiWorkflowAdapter — session-first turn routing (SA4E-334 Option A).
 * Serializes turns, forwards live tool activity, routes each turn through a
 * real AgentSession, and falls back to the legacy engine path on failure.
 */
import type { PipelineState } from '../types/pi-workflow-state.js';
import type { ChatExtToWebviewMessage } from '../../chat-panel/message-protocol';
import type { ToolLiveEvent } from '../pi-event-mapper.js';
import { providerRequiresApiKey, getExtensionVersion, buildCredentialResolver, readProviderTurnConfig } from '../pi-provider-config-bridge.js';
import { isBudgetExceededError } from '../../pi-agent/budget-gate.js';
import { debugLog } from '../../debug-logger';
import { AdapterCore } from './adapter-core.js';
import { forwardToolLiveEvent } from './tool-live-events.js';
import { notifyPeerUserActivity } from '../peer/lifecycle.js';
import { peerApprovalGateOrUndefined, setCurrentTurnImages } from '../peer/runtime.js';

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

  // SA4E-391 multimodal: optional user-attached images for this turn.
  // `delegationOnly` = images are for peer_send forwarding only (this tab's
  // model is non-vision), so they must NOT be fed to this model's own prompt.
  async invokeChat(chatInput: string, images?: import('../session-host/types.js').TurnImage[], delegationOnly?: boolean): Promise<void> {
    const tab = this.store.activeTab || 'CHAT';
    const state = this.store.get(tab) || this.store.chatStateFor(tab);
    await this.runTurn(state, chatInput, state.ticketKey, images, delegationOnly);
  }

  private async runTurn(state: PipelineState, chatInput: string, ticketKey: string, images?: import('../session-host/types.js').TurnImage[], delegationOnly?: boolean): Promise<void> {
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
    // A per-turn cancel signal: cancel() rejects it so a turn stuck on a dead
    // endpoint settles immediately (host abort alone cannot free a half-open
    // socket). The turn races runTurnOnce against this rejection; whichever
    // settles first wins, and the losing branch's result is ignored.
    const exec = prev.catch(() => {}).then(() => {
      // SA4E-391: publish THIS turn's images only when its turn actually starts
      // (turns are FIFO-queued) so a queued turn's images are not overwritten
      // by a later enqueue. Cleared in the finally below.
      // `delegationOnly` → DON'T feed images to this (non-vision) model's own
      // prompt, but DO expose them to peer_send so the agent can forward them.
      this.pendingTurnImages = delegationOnly ? undefined : images;
      // SA4E-391 multimodal peer: expose the images to peer_send for THIS tab
      // so the sender agent can delegate "read this image" to a vision peer.
      try { setCurrentTurnImages(this.store.activeTab || 'CHAT', images); } catch { /* non-fatal */ }
      const cancelled = new Promise<void>((_, reject) => { this.turnCancelReject = reject; });
      // Swallow the cancel rejection AFTER the race so the chain never prints
      // an unhandled rejection; the chat:workingStatus(false) is emitted below.
      cancelled.catch(() => {});
      return Promise.race([
        this.runTurnOnce(state, chatInput, ticketKey),
        cancelled,
      ]).catch((err) => {
        if ((err as Error)?.message === 'PI_TURN_CANCELLED') {
          // User cancelled: stop the working bar; the host was already aborted
          // in cancel(). Swallow so the turn settles cleanly (chain releases).
          this.onEvent({ type: 'chat:workingStatus', working: false } as ChatExtToWebviewMessage);
          return;
        }
        throw err;
      });
    });
    // BUGFIX: the `.finally` must compare against the SAME promise we store in
    // turnInFlight. Previously we stored `exec.finally(...)` but compared the
    // guard against `exec` — a different object — so `turnInFlight === exec`
    // was ALWAYS false and turnInFlight was NEVER cleared. After the first
    // turn ever ran, every later message wrongly showed "Finishing previous
    // message". Capture the composed promise in `tracked` and self-compare.
    const tracked: Promise<void> = exec.finally(() => {
      // Clear the signal reference only if it still belongs to this turn —
      // a newer turn may have replaced it (queued message starting).
      this.turnCancelReject = undefined;
      this.pendingTurnImages = undefined; // SA4E-391: never leak images across turns
      try { setCurrentTurnImages(this.store.activeTab || 'CHAT', undefined); } catch { /* non-fatal */ }
      if (this.turnInFlight === tracked) this.turnInFlight = undefined;
    });
    this.turnInFlight = tracked;
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
   * Routing (SA4E-369 UAT root-cause fix): session-first for ALL providers.
   * Key-requiring (cloud) providers need a real key; keyless local endpoints
   * (lmstudio/ollama/onnx) are served by the session host via the shared
   * keyless gateway registration (pi-gateway-provider + LOCAL_KEYLESS_
   * PLACEHOLDER) — the stale "local → legacy ALWAYS" gate was removed. The
   * legacy path remains the fail-safe fallback for every provider.
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
      // SA4E-369 UAT root-cause fix — ONE shared config read for both turn
      // paths (dot keys + legacy flat fallback; see readProviderTurnConfig).
      const { providerId, baseUrl, configuredModelId } = readProviderTurnConfig();
      const resolver = this.secrets ? buildCredentialResolver(this.secrets) : undefined;
      const apiKey = resolver ? await resolver(providerId) : undefined;
      // Key-REQUIRING providers without a key keep the fail-closed
      // PI_CREDENTIALS_MISSING error on the legacy path below. Keyless local
      // endpoints (lmstudio/ollama/onnx) PROCEED without a key: the session
      // host seeds LOCAL_KEYLESS_PLACEHOLDER auth and registers the proven
      // keyless gateway (real /v1/models), so per-tab sessions, budget gates
      // and the SA4E-369 peer tools exist in EVERY tab (UG §4). Any session
      // failure falls back to the legacy path below (fail-safe, unchanged).
      if (providerRequiresApiKey(providerId) && !apiKey) return false;
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
      // webview opens exactly ONE bubble and always closes it. Late
      // completions are dropped via live=false so an aborted/timed-out
      // session can never bleed tokens into a later turn. Cancel and timeout
      // now ABORT the session (adapter cancel()/this timeout branch), so the
      // run settles and the next turn is never chained behind a zombie.
      const streamId = turnStreamId;
      let live = true;
      // Track whether ANY answer token streamed. Some providers/models (local
      // llama-server / qwen via the session host) return the reply in one block
      // without per-token deltas, so onToken never fires. The webview only
      // builds the assistant bubble from token deltas — without this flag a
      // non-streaming reply (e.g. a short "Hello") is produced by the model
      // (log: text=NNNch) but NEVER rendered. We emit res.text as one token
      // after the turn when nothing streamed (see below).
      let sawToken = false;
      // timeoutMs <= 0 → NO wall-clock backstop (product decision: stop only on
      // repetition, never elapsed time). Only race a timeout when opt-in (>0).
      const promptPromise = host.promptTurn(
        chatInput,
        (token) => {
          if (!live) return;
          sawToken = true;
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
        },
        // SA4E-391 multimodal: forward this turn's attached images to the model.
        this.pendingTurnImages && this.pendingTurnImages.length > 0
          ? { images: this.pendingTurnImages }
          : undefined
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
          // Timeout claimed the turn — ABORT the session too, otherwise the
          // run keeps streaming in the background (zombie turn) and the
          // single-flight chain blocks the tab's next message forever.
          void import('../session-host/registry.js').then(m => m.abortSessionHost(this.workspaceRoot, tabId)).catch(() => {});
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
      // Non-streaming fallback: if the model returned text but NO token delta
      // ever fired (onToken never called — common for local llama-server/qwen
      // via the session host), emit the whole reply as ONE token now so the
      // webview builds+fills the assistant bubble. Without this the reply is
      // generated but invisible (only the user bubble shows).
      if (live && !sawToken && res && typeof res.text === 'string' && res.text.length > 0) {
        this.streamHandler.emitToken('pi', res.text, streamId);
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
