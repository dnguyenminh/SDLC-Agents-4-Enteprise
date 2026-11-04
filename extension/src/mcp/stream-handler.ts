/**
 * StreamHandler — KSA-210
 * Bridges LangGraph node events to Chat Panel postMessage protocol.
 * Token events are debounced (50ms); status/complete/error flush immediately.
 */

import { ChatExtToWebviewMessage } from "../chat-panel/message-protocol";

/** Maximum buffer size to prevent memory issues */
const MAX_BUFFER_SIZE = 100;

export class StreamHandler {
  private buffer: ChatExtToWebviewMessage[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly DEBOUNCE_MS = 50;
  private originTabId: string | undefined;

  constructor(private readonly emit: (msg: ChatExtToWebviewMessage) => void, originTabId?: string) {
    this.originTabId = originTabId;
  }

  /**
   * SA4E-391: the origin tab id of the CURRENTLY running turn. Turns are
   * single-flight (serialized), so the running turn owns this value for its
   * whole lifetime; the adapter sets it at turn start and clears it at settle.
   * This stamps every stream event with the tab that PRODUCED it — so a turn
   * from another tab (queued/started after a switch) can never mislabel this
   * turn's late events. Any buffered token already carries the origin via
   * withOriginTabId at flush time.
   */
  setOriginTabId(tabId: string | undefined): void {
    // Flush anything buffered under the previous origin BEFORE switching, so a
    // pending chunk is never re-stamped with a different turn's tab.
    this.flush();
    this.originTabId = tabId;
  }

  /** SA4E-391: the origin tab of the currently running turn (or undefined
   * between turns). Used to stamp side-channel events (live tool activity)
   * that don't flow through this handler's emit path but must still route to
   * the producing tab. */
  getOriginTabId(): string | undefined {
    return this.originTabId;
  }

  /** Add originTabId to message if set (stamp from the running turn). */
  private withOriginTabId(msg: ChatExtToWebviewMessage): ChatExtToWebviewMessage {
    if (this.originTabId) {
      // Runtime: all messages passed here (streamChunk, streamComplete, toolCall) support originTabId.
      // Use type assertion to bypass the union-member spread check.
      return { ...msg, originTabId: this.originTabId } as ChatExtToWebviewMessage;
    }
    return msg;
  }

  /** Buffer token events, flush on debounce window.
   * streamId is REQUIRED and must be stable for the whole turn (one turn =
   * one stream identity: start → tokens → complete/error). Per-flush generated
   * ids fragment one answer into many bubbles and orphan completions.
   */
  emitToken(nodeId: string, content: string, streamId: string): void {
    this.bufferChunk("token", nodeId, content, streamId);
  }

  /** SA4E-THINKING: buffer reasoning (thinking) delta events like tokens —
   * debounced so the webview ThinkingBlock streams without postMessage storms.
   */
  emitThinking(nodeId: string, content: string, streamId: string): void {
    this.bufferChunk("thinking", nodeId, content, streamId);
  }

  /** Shared buffered chunk path for token/thinking deltas. */
  private bufferChunk(
    eventType: "token" | "thinking",
    nodeId: string,
    content: string,
    streamId: string
  ): void {
    this.buffer.push({
      type: "chat:streamChunk",
      streamId,
      nodeId,
      eventType,
      content,
      timestamp: new Date().toISOString(),
    });

    // Prevent unbounded buffer growth
    if (this.buffer.length > MAX_BUFFER_SIZE) {
      this.flush();
      return;
    }

    this.scheduleFlush();
  }

  /** Immediately flush on status events */
  emitStatus(nodeId: string, status: string, streamId: string): void {
    this.flush(); // Flush any pending tokens first
    this.emit(this.withOriginTabId({
      type: "chat:streamChunk",
      streamId,
      nodeId,
      eventType: "status",
      content: status,
      timestamp: new Date().toISOString(),
    }));
  }

  /** Immediately flush on complete events */
  emitComplete(nodeId: string, duration: number, streamId: string): void {
    this.flush();
    this.emit(this.withOriginTabId({
      type: "chat:streamComplete",
      streamId,
      nodeId,
      finalContent: `Node ${nodeId} completed in ${duration}ms`,
      metadata: { duration },
    }));
  }

  /** Immediately flush on error events */
  emitError(nodeId: string, error: string, streamId: string): void {
    this.flush();
    this.emit(this.withOriginTabId({
      type: "chat:streamChunk",
      streamId,
      nodeId,
      eventType: "error",
      content: error,
      timestamp: new Date().toISOString(),
    }));
  }

  // === Self-Correction Events (KSA-233) ===

  /** Emit retry event — immediate flush (not buffered) */
  emitRetry(
    nodeId: string,
    attempt: number,
    maxAttempts: number,
    delayMs: number,
    error: string,
    streamId: string
  ): void {
    this.flush();
    this.emit(this.withOriginTabId({
      type: "chat:streamChunk",
      streamId,
      nodeId,
      eventType: "retry",
      content: JSON.stringify({ attempt, maxAttempts, delayMs, error }),
      timestamp: new Date().toISOString(),
    }));
  }

  /** Emit verify event — immediate flush */
  emitVerify(
    nodeId: string,
    passed: boolean,
    feedback: string | null,
    attempt: number,
    streamId: string
  ): void {
    this.flush();
    this.emit(this.withOriginTabId({
      type: "chat:streamChunk",
      streamId,
      nodeId,
      eventType: "verify",
      content: JSON.stringify({ passed, feedback, attempt }),
      timestamp: new Date().toISOString(),
    }));
  }

  /** Emit strategy switch event — immediate flush */
  emitStrategySwitch(
    nodeId: string,
    fromStrategy: string,
    toStrategy: string,
    reason: string,
    streamId: string
  ): void {
    this.flush();
    this.emit(this.withOriginTabId({
      type: "chat:streamChunk",
      streamId,
      nodeId,
      eventType: "strategy_switch",
      content: JSON.stringify({ fromStrategy, toStrategy, reason }),
      timestamp: new Date().toISOString(),
    }));
  }

  /** Emit human intervention required event — immediate flush */
  emitHumanIntervention(
    nodeId: string,
    failedStrategies: string[],
    verifyHistory: Array<{ attempt: number; feedback: string }>,
    streamId: string
  ): void {
    this.flush();
    this.emit(this.withOriginTabId({
      type: "chat:streamChunk",
      streamId,
      nodeId,
      eventType: "human_intervention_required",
      content: JSON.stringify({ failedStrategies, verifyHistory }),
      timestamp: new Date().toISOString(),
    }));
  }

  /** Dispose: flush remaining and cancel timer */
  dispose(): void {
    this.flush();
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /** Emit a raw message directly (used for toolCall messages) */
  emitDirect(msg: ChatExtToWebviewMessage): void {
    this.flush();
    this.emit(this.withOriginTabId(msg));
  }

  private scheduleFlush(): void {
    if (this.flushTimer) { return; }
    this.flushTimer = setTimeout(() => this.flush(), this.DEBOUNCE_MS);
  }

  private flush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    const messages = this.buffer.splice(0);
    for (const msg of messages) {
      this.emit(this.withOriginTabId(msg));
    }
  }
}