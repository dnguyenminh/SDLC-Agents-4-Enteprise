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

  constructor(private readonly emit: (msg: ChatExtToWebviewMessage) => void) {}

  /** Buffer token events, flush on debounce window */
  emitToken(nodeId: string, content: string, streamId: string | null): void {
    this.buffer.push({
      type: "chat:streamChunk",
      streamId: streamId ?? `stream-${nodeId}-${Date.now()}`,
      nodeId,
      eventType: "token",
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
  emitStatus(nodeId: string, status: string, streamId: string | null): void {
    this.flush(); // Flush any pending tokens first
    this.emit({
      type: "chat:streamChunk",
      streamId: streamId ?? `stream-${nodeId}-${Date.now()}`,
      nodeId,
      eventType: "status",
      content: status,
      timestamp: new Date().toISOString(),
    });
  }

  /** Immediately flush on complete events */
  emitComplete(nodeId: string, duration: number, streamId: string | null): void {
    this.flush();
    this.emit({
      type: "chat:streamComplete",
      streamId: streamId ?? `stream-${nodeId}-${Date.now()}`,
      nodeId,
      finalContent: `Node ${nodeId} completed in ${duration}ms`,
      metadata: { duration },
    });
  }

  /** Immediately flush on error events */
  emitError(nodeId: string, error: string, streamId: string | null): void {
    this.flush();
    this.emit({
      type: "chat:streamChunk",
      streamId: streamId ?? `stream-${nodeId}-${Date.now()}`,
      nodeId,
      eventType: "error",
      content: error,
      timestamp: new Date().toISOString(),
    });
  }

  // === Self-Correction Events (KSA-233) ===

  /** Emit retry event — immediate flush (not buffered) */
  emitRetry(
    nodeId: string,
    attempt: number,
    maxAttempts: number,
    delayMs: number,
    error: string,
    streamId: string | null
  ): void {
    this.flush();
    this.emit({
      type: "chat:streamChunk",
      streamId: streamId ?? `stream-${nodeId}-${Date.now()}`,
      nodeId,
      eventType: "retry",
      content: JSON.stringify({ attempt, maxAttempts, delayMs, error }),
      timestamp: new Date().toISOString(),
    });
  }

  /** Emit verify event — immediate flush */
  emitVerify(
    nodeId: string,
    passed: boolean,
    feedback: string | null,
    attempt: number,
    streamId: string | null
  ): void {
    this.flush();
    this.emit({
      type: "chat:streamChunk",
      streamId: streamId ?? `stream-${nodeId}-${Date.now()}`,
      nodeId,
      eventType: "verify",
      content: JSON.stringify({ passed, feedback, attempt }),
      timestamp: new Date().toISOString(),
    });
  }

  /** Emit strategy switch event — immediate flush */
  emitStrategySwitch(
    nodeId: string,
    fromStrategy: string,
    toStrategy: string,
    reason: string,
    streamId: string | null
  ): void {
    this.flush();
    this.emit({
      type: "chat:streamChunk",
      streamId: streamId ?? `stream-${nodeId}-${Date.now()}`,
      nodeId,
      eventType: "strategy_switch",
      content: JSON.stringify({ fromStrategy, toStrategy, reason }),
      timestamp: new Date().toISOString(),
    });
  }

  /** Emit human intervention required event — immediate flush */
  emitHumanIntervention(
    nodeId: string,
    failedStrategies: string[],
    verifyHistory: Array<{ attempt: number; feedback: string }>,
    streamId: string | null
  ): void {
    this.flush();
    this.emit({
      type: "chat:streamChunk",
      streamId: streamId ?? `stream-${nodeId}-${Date.now()}`,
      nodeId,
      eventType: "human_intervention_required",
      content: JSON.stringify({ failedStrategies, verifyHistory }),
      timestamp: new Date().toISOString(),
    });
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
    this.emit(msg);
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
      this.emit(msg);
    }
  }
}
