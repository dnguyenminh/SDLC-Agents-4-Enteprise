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
import { getSetting } from '../../config/settings-migration.js';
import {
  DEFAULT_STREAM_LOOP_MAX_CONTINUES,
  normalizeStreamLoopMaxContinues,
} from '../stream-loop-continuation.js';
import { runStreamLoopTurn, type LoopPromptTurnFn } from './session-turn-stream-loop.js';
import type { SessionTurnResult } from '../session-host/types.js';

export abstract class AdapterSessionTurns extends AdapterCore {
  /** Implemented by the legacy-path level (./adapter-legacy-turns.ts). */
  protected abstract runTurnOnce(
    state: PipelineState,
    chatInput: string,
    ticketKey: string,
    originTabId: string
  ): Promise<void>;

  /** LangGraphEngine-compatible: invoke(ticketKey, phase, chatInput, intent?, autonomyLevel?, tabId?) */
  async invoke(ticketKey: string, phase: string, chatInput: string, _intent?: unknown, _autonomyLevel?: unknown, tabId?: string): Promise<void> {
    // SA4E-391 Bug 1 (cross-tab thinking leak): pin the turn's origin tab at
    // SUBMIT time. `store.activeTab` is a single mutable field shared by every
    // tab — reading it later (when a QUEUED turn finally starts) re-labels the
    // turn with whatever tab the user happens to be looking at, so the turn's
    // thinking/tool/answer blocks land in the WRONG tab.
    const originTabId = tabId || this.store.activeTab || 'CHAT';
    // SA4E-391 cross-tab routing: pin the store's active tab to the SUBMITTING
    // tab (webview UUID) before the turn runs, so origin stamping and peer
    // activity are keyed to the tab that produced the turn — not whichever tab
    // the host last saw a tab:switch for.
    if (tabId) this.store.switchTab(tabId);
    const state = this.store.stateFor(ticketKey);
    this.store.setActiveTicketKey(ticketKey);
    state.currentPhase = phase || state.currentPhase;
    state.chatHistory = this.store.getHistory() || state.chatHistory;
    await this.runTurn(state, chatInput, ticketKey, undefined, undefined, originTabId);
  }

  // SA4E-391 multimodal: optional user-attached images for this turn.
  // `delegationOnly` = images are for peer_send forwarding only (this tab's
  // model is non-vision), so they must NOT be fed to this model's own prompt.
  async invokeChat(chatInput: string, images?: import('../session-host/types.js').TurnImage[], delegationOnly?: boolean, tabId?: string): Promise<void> {
    // SA4E-391 Bug 1 (cross-tab thinking leak): capture the SUBMITTING tab
    // before anything can mutate the shared `store.activeTab`. The value below
    // is the turn's permanent origin — a later tab switch must never re-label
    // this turn's output.
    const originTabId = tabId || this.store.activeTab || 'CHAT';
    // SA4E-391 cross-tab routing: the submitting tab is the single source of
    // truth for this turn's origin. Pin it BEFORE deriving state/origin so
    // store.activeTab matches the tab the user typed in (fixes tab A's output
    // rendering in tab B after a mid-turn switch).
    if (tabId) this.store.switchTab(tabId);
    const tab = originTabId;
    const state = this.store.get(tab) || this.store.chatStateFor(tab);
    this.store.setActiveTicketKey(state.ticketKey);
    await this.runTurn(state, chatInput, state.ticketKey, images, delegationOnly, originTabId);
  }

  private async runTurn(
    state: PipelineState,
    chatInput: string,
    ticketKey: string,
    images?: import('../session-host/types.js').TurnImage[],
    delegationOnly?: boolean,
    originTabId: string = this.store.activeTab || 'CHAT'
  ): Promise<void> {
    // S-01(3)/BR-9: any user msg resets the anti-loop chains of the tab (both invoke + invokeChat
    // flows, keyed by the SAME tab key the peer registry uses). Wraps in try/catch — never throws.
    notifyPeerUserActivity(originTabId);
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
      // Keyed by the PINNED origin tab — never by the mutable store.activeTab.
      try { setCurrentTurnImages(originTabId, images); } catch { /* non-fatal */ }
      const cancelled = new Promise<void>((_, reject) => { this.turnCancelReject = reject; });
      // Swallow the cancel rejection AFTER the race so the chain never prints
      // an unhandled rejection; the chat:workingStatus(false) is emitted below.
      cancelled.catch(() => {});
      return Promise.race([
        this.runTurnOnce(state, chatInput, ticketKey, originTabId),
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
      // SA4E-391 Bug 1: clear THIS turn's images under the PINNED origin tab —
      // the mutable store.activeTab may already point at a different tab.
      try { setCurrentTurnImages(originTabId, undefined); } catch { /* non-fatal */ }
      // SA4E-391: clear the stream origin at settle so any event emitted
      // BETWEEN turns is not stamped with the finished turn's tab. The next
      // turn re-stamps its own origin at start (trySessionTurn/runTurnOnce).
      try { this.streamHandler.setOriginTabId(undefined); } catch { /* non-fatal */ }
      if (this.turnInFlight === tracked) this.turnInFlight = undefined;
    });
    this.turnInFlight = tracked;
    return this.turnInFlight;
  }

  /** Forward live tool activity to the sidebar tool-block UI (see ./tool-live-events.ts).
   * SA4E-391: live tool events bypass the StreamHandler emit path, so stamp
   * the running turn's origin tab here (read from the handler the turn just
   * set) — otherwise the provider's fallback would route them to whichever
   * tab is active now, not the tab that produced the turn. */
  protected postToolLiveEvent(e: ToolLiveEvent): void {
    const originTabId = this.streamHandler.getOriginTabId();
    // SA4E-391 Bug 2: flush any buffered tokens BEFORE emitting the tool call,
    // otherwise a debounced token that was produced BEFORE the tool starts
    // could be delivered AFTER the tool block, breaking chronological order.
    this.streamHandler.flush();
    forwardToolLiveEvent((msg) => {
      this.onEvent(originTabId ? ({ ...msg, originTabId } as ChatExtToWebviewMessage) : msg);
    }, e);
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
    turnStreamId: string,
    originTabId: string
  ): Promise<boolean> {
    // One stable stream identity per turn (streaming-identity fix).
    const turnStart = Date.now();
    // SA4E-391 Bug 1: the origin tab is PINNED by the caller at SUBMIT time.
    // It must NOT be re-derived from `store.activeTab` here — that field is
    // shared and mutable, so a tab switch between submit and turn-start
    // re-labelled the turn and leaked its thinking/answer into the focused tab.
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
      const tabId = originTabId; // SA4E-391: pinned at turn start (above)
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
      // SA4E-391 cross-tab routing: stamp THIS turn's tab id onto every stream
      // event it produces (turns are single-flight, so the running turn owns
      // the StreamHandler origin for its lifetime). Fixes tab 1's late output
      // rendering in tab 2 after a mid-turn tab switch.
      this.streamHandler.setOriginTabId(tabId);
      // CHAT-LOOP-CONT: bounded stream-loop auto-continuation (see
      // ./session-turn-stream-loop.ts). Watches BOTH streamed surfaces for
      // degeneration (the "thinking block stops halfway" bug: the model
      // repeats a fragment until the OUTPUT token limit silently cuts the
      // response — finish_reason "length" was never surfaced). On a trip the
      // degenerate run is aborted and ONE fresh continuation message —
      // anchored on the last coherent reasoning — is sent to the SAME
      // session, so the turn CONTINUES instead of dying mid-sentence.
      // Bounded by sdlcAgents.chat.streamLoopMaxContinues (default 1);
      // exhausted → a visible stop notice, never a silent cut.
      const maxContinues = normalizeStreamLoopMaxContinues(
        getSetting<number>('chat.streamLoopMaxContinues', 'streamLoopMaxContinues', DEFAULT_STREAM_LOOP_MAX_CONTINUES)
      );
      const outcome = await runStreamLoopTurn<SessionTurnResult>({
        promptTurn: host.promptTurn as unknown as LoopPromptTurnFn,
        streamHandler: this.streamHandler,
        initialPrompt: chatInput,
        firstStreamId: streamId,
        // SA4E-391 multimodal: images ride ONLY the first (user) prompt —
        // continuation prompts are text-only guidance.
        firstAttemptOpts:
          this.pendingTurnImages && this.pendingTurnImages.length > 0
            ? { images: this.pendingTurnImages }
            : undefined,
        maxContinues,
        timeoutMs,
        onToolEvent: (e) => this.postToolLiveEvent(e as ToolLiveEvent),
        abortActiveSession: () => {
          void import('../session-host/registry.js').then(m => m.abortSessionHost(this.workspaceRoot, tabId)).catch(() => {});
        },
      });
      if (outcome.kind === 'timeout') {
        // Timeout claimed the turn — ABORT the session too, otherwise the
        // run keeps streaming in the background (zombie turn) and the
        // single-flight chain blocks the tab's next message forever.
        void import('../session-host/registry.js').then(m => m.abortSessionHost(this.workspaceRoot, tabId)).catch(() => {});
        this.streamHandler.emitComplete('pi', Date.now() - turnStart, outcome.interruptedStreamId);
        this.onEvent({
          type: 'chat:error',
          code: 'PI_SESSION_TIMEOUT',
          message: `Session turn timed out after ${Math.round(timeoutMs / 1000)}s. Narrow the scope and retry.`,
          retryable: true,
          originTabId: tabId,
        } as ChatExtToWebviewMessage);
        return true;
      }
      const { res, sawToken, finalStreamId, continuationPrompts } = outcome;
      const finalText = res && typeof res.text === 'string' ? res.text : '';
      // Non-streaming fallback: if the model returned text but NO token delta
      // ever fired in the FINAL attempt (onToken never called — common for
      // local llama-server/qwen via the session host), emit the whole reply as
      // ONE token now so the webview builds+fills the assistant bubble.
      // Without this the reply is generated but invisible (only the user
      // bubble shows).
      if (!sawToken && finalText.length > 0) {
        this.streamHandler.emitToken('pi', finalText, finalStreamId);
      }
      // Always close the stream, even for textless turns (tool-only output
      // still opened a bubble that must be closed).
      // CHAT-LOOP-CONT: pass stopReason if the turn was cut by output token limit.
      this.streamHandler.emitComplete('pi', Date.now() - turnStart, finalStreamId, res?.stopReason);
      // Mirror the turn into the lightweight store (context usage + fallback coherence).
      // CHAT-LOOP-CONT: continuation prompts are mirrored too — they are real
      // turns in the session transcript, so the context meter stays honest.
      const history = [...(this.store.getHistory() || state.chatHistory || [])];
      history.push({ role: 'user', content: chatInput } as never);
      for (const cp of continuationPrompts) history.push({ role: 'user', content: cp } as never);
      if (finalText) history.push({ role: 'assistant', content: finalText } as never);
      this.store.setHistory(history as never);
      this.store.save(ticketKey, { ...state, chatHistory: history } as PipelineState);
      if (res?.sessionFile) {
        debugLog(`[Chat] turn via=session ext=${getExtensionVersion()} workspace=${this.workspaceRoot} file=${res.sessionFile} tools=${res.toolCalls.length} text=${finalText.length}ch loops=${outcome.loopKinds.length}`);
      }
      return true;
    } catch (err) {
      // SA4E-355 Task 5 (BR-09/STC-307): a gate REJECT claims the turn — the
      // actionable chat:error is the ONLY output and the legacy engine (hence
      // the provider) is NEVER invoked with the oversized prompt.
      if (isBudgetExceededError(err)) {
        // SA4E-391: stamp origin so this late error renders in the tab that
        // produced the turn, never in whichever tab is active now.
        this.streamHandler.setOriginTabId(originTabId);
        this.streamHandler.emitComplete('pi', Date.now() - turnStart, turnStreamId);
        this.onEvent({
          type: 'chat:error',
          code: 'PI_CONTEXT_BUDGET_EXCEEDED',
          message: (err as Error).message,
          retryable: false,
          originTabId,
        } as ChatExtToWebviewMessage);
        return true;
      }
      debugLog(`[PiWorkflowAdapter] session turn fallback: ${(err as Error).message.slice(0, 160)}`);
      return false;
    }
  }
}
