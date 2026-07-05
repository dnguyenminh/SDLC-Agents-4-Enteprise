/**
 * BaseNode Retry Tests — KSA-233
 * Tests auto-retry with exponential backoff, non-recoverable error bypass,
 * backoff timing, and timeout-during-retry behavior.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock vscode module (unavailable outside extension host)
vi.mock("vscode", () => ({
  workspace: { workspaceFolders: [], getConfiguration: () => ({ get: () => undefined }) },
  Uri: { file: (p: string) => ({ fsPath: p }) },
  FileType: { Directory: 2, File: 1 },
  window: { tabGroups: { all: [] } },
  languages: { getDiagnostics: () => [] },
}));

import { BaseNode } from "../nodes/base-node";
import { StreamHandler } from "../stream-handler";
import { McpBridge } from "../mcp-bridge";
import { NonRecoverableError } from "../errors/non-recoverable-error";
import type { PipelineState } from "../state";

// --- Concrete test subclass ---

class TestNode extends BaseNode {
  public executeFn: (state: PipelineState) => Promise<Partial<PipelineState>>;

  constructor(
    nodeId: string,
    mcpBridge: McpBridge,
    streamHandler: StreamHandler,
    executeFn?: (state: PipelineState) => Promise<Partial<PipelineState>>
  ) {
    super(nodeId, mcpBridge, streamHandler);
    this.executeFn = executeFn ?? (async () => ({}));
  }

  async execute(state: PipelineState): Promise<Partial<PipelineState>> {
    return this.executeFn(state);
  }
}

// --- Helpers ---

function createMockStreamHandler(): StreamHandler {
  const emitFn = vi.fn();
  const handler = new StreamHandler(emitFn);
  vi.spyOn(handler, "emitStatus");
  vi.spyOn(handler, "emitComplete");
  vi.spyOn(handler, "emitError");
  vi.spyOn(handler, "emitRetry");
  return handler;
}

function createMockMcpBridge(): McpBridge {
  return {
    callTool: vi.fn(),
    listTools: vi.fn(),
    isAvailable: vi.fn().mockReturnValue(true),
  } as unknown as McpBridge;
}

function createBaseState(overrides: Partial<PipelineState> = {}): PipelineState {
  return {
    ticketKey: "KSA-233",
    threadId: "thread-1",
    currentPhase: "implementation",
    intent: "sdlc",
    pipelineStatus: "running",
    resumePoint: null,
    documents: {},
    agentOutputs: [],
    currentStreamId: "stream-test",
    approvalRequired: false,
    approvalDecision: null,
    userFeedback: null,
    pendingApprovals: [],
    chatHistory: [],
    errors: [],
    retryCount: {},
    createdAt: "2026-01-01T00:00:00Z",
    lastUpdatedAt: "2026-01-01T00:00:00Z",
    lastCheckpointAt: null,
    feedbackIterations: 0,
    maxFeedbackIterations: 5,
    discrepancyFound: false,
    previousNode: null,
    parallelResults: {},
    qualityGateResults: {},
    toolCalls: null,
    toolResults: [],
    agentIterations: 0,
    verifyPassed: true,
    verifyFeedback: null,
    verifyAttempts: {},
    maxVerifyAttempts: 2,
    activeStrategy: {},
    strategyHistory: [],
  } as PipelineState;
}

// --- Tests ---

describe("BaseNode Auto-Retry (KSA-233)", () => {
  let streamHandler: StreamHandler;
  let mcpBridge: McpBridge;

  beforeEach(() => {
    vi.useFakeTimers();
    streamHandler = createMockStreamHandler();
    mcpBridge = createMockMcpBridge();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("TC-1: Auto-retry succeeds on first retry (execute fails once then succeeds)", async () => {
    let callCount = 0;
    const node = new TestNode("test_node", mcpBridge, streamHandler, async () => {
      callCount++;
      if (callCount === 1) throw new Error("Transient failure");
      return { pipelineStatus: "running" as const };
    });

    const state = createBaseState();
    const runPromise = node.run(state);

    // Advance past first backoff (1000ms)
    await vi.advanceTimersByTimeAsync(1000);

    const result = await runPromise;

    expect(result.pipelineStatus).not.toBe("failed");
    expect(callCount).toBe(2);
    expect(result.retryCount).toEqual({ test_node: 1 });
    expect(streamHandler.emitRetry).toHaveBeenCalledTimes(1);
    expect(streamHandler.emitRetry).toHaveBeenCalledWith(
      "test_node", 1, 2, 1000, "Transient failure", "stream-test"
    );
    expect(streamHandler.emitComplete).toHaveBeenCalledTimes(1);
  });

  it("TC-2: Auto-retry succeeds on second retry (fails twice then succeeds)", async () => {
    let callCount = 0;
    const node = new TestNode("test_node", mcpBridge, streamHandler, async () => {
      callCount++;
      if (callCount <= 2) throw new Error(`Failure #${callCount}`);
      return { pipelineStatus: "running" as const };
    });

    const state = createBaseState();
    const runPromise = node.run(state);

    // First backoff: 1000ms
    await vi.advanceTimersByTimeAsync(1000);
    // Second backoff: 2000ms
    await vi.advanceTimersByTimeAsync(2000);

    const result = await runPromise;

    expect(result.pipelineStatus).not.toBe("failed");
    expect(callCount).toBe(3);
    expect(result.retryCount).toEqual({ test_node: 2 });
    expect(streamHandler.emitRetry).toHaveBeenCalledTimes(2);
    expect(streamHandler.emitRetry).toHaveBeenNthCalledWith(
      1, "test_node", 1, 2, 1000, "Failure #1", "stream-test"
    );
    expect(streamHandler.emitRetry).toHaveBeenNthCalledWith(
      2, "test_node", 2, 2, 2000, "Failure #2", "stream-test"
    );
    expect(streamHandler.emitComplete).toHaveBeenCalledTimes(1);
  });

  it("TC-3: All retries exhausted (fails 3 times → pipelineStatus='failed')", async () => {
    const node = new TestNode("test_node", mcpBridge, streamHandler, async () => {
      throw new Error("Persistent failure");
    });

    const state = createBaseState();
    const runPromise = node.run(state);

    // Advance through both backoff delays
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);

    const result = await runPromise;

    expect(result.pipelineStatus).toBe("failed");
    expect(result.retryCount).toEqual({ test_node: 3 });
    expect(result.errors).toHaveLength(1);
    expect(result.errors![0]).toMatchObject({
      nodeId: "test_node",
      message: "Persistent failure",
      recoverable: true,
    });
    expect(streamHandler.emitRetry).toHaveBeenCalledTimes(2);
    expect(streamHandler.emitError).toHaveBeenCalledTimes(1);
    expect(streamHandler.emitComplete).not.toHaveBeenCalled();
  });

  it("TC-4: NonRecoverableError skips retry (immediate failure)", async () => {
    const node = new TestNode("test_node", mcpBridge, streamHandler, async () => {
      throw new NonRecoverableError("Missing configuration", "CONFIG_MISSING");
    });

    const state = createBaseState();
    const result = await node.run(state);

    expect(result.pipelineStatus).toBe("failed");
    expect(result.retryCount).toEqual({ test_node: 0 });
    expect(result.errors).toHaveLength(1);
    expect(result.errors![0]).toMatchObject({
      nodeId: "test_node",
      code: "NonRecoverableError",
      message: "Missing configuration",
      recoverable: false,
    });
    expect(streamHandler.emitRetry).not.toHaveBeenCalled();
    expect(streamHandler.emitError).toHaveBeenCalledTimes(1);
  });

  it("TC-13: Backoff timing correct (1000ms then 2000ms)", async () => {
    const timestamps: number[] = [];
    let callCount = 0;
    const node = new TestNode("test_node", mcpBridge, streamHandler, async () => {
      timestamps.push(Date.now());
      callCount++;
      if (callCount <= 2) throw new Error("fail");
      return {};
    });

    const state = createBaseState();
    const runPromise = node.run(state);

    // After initial call, advance 1000ms for first retry
    await vi.advanceTimersByTimeAsync(1000);
    // Advance 2000ms for second retry
    await vi.advanceTimersByTimeAsync(2000);

    await runPromise;

    expect(callCount).toBe(3);
    // Verify delays: second call at +1000ms, third call at +3000ms from start
    const delay1 = timestamps[1] - timestamps[0];
    const delay2 = timestamps[2] - timestamps[1];
    expect(delay1).toBe(1000);
    expect(delay2).toBe(2000);
  });

  it("TC-16: Timeout during retry counts as failure", async () => {
    // Simulate a very slow execute that exceeds timeout
    const node = new TestNode("test_node", mcpBridge, streamHandler, async () => {
      // This will never resolve before the timeout
      await new Promise((resolve) => setTimeout(resolve, 400_000));
      return {};
    });

    const state = createBaseState();
    const runPromise = node.run(state);

    // Advance past NODE_TIMEOUT_MS (300,000ms) for initial attempt
    await vi.advanceTimersByTimeAsync(300_000);
    // Advance past backoff (1000ms) + NODE_TIMEOUT for second attempt
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(300_000);
    // Advance past backoff (2000ms) + NODE_TIMEOUT for third attempt
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(300_000);

    const result = await runPromise;

    expect(result.pipelineStatus).toBe("failed");
    expect(result.errors![0].message).toContain("timed out");
  });
});
