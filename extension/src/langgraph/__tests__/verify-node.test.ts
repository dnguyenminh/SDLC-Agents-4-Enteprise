/**
 * VerifyNode Tests — KSA-233
 * Tests verification pass/fail paths, fail-open on error, skip when
 * no criteria, and auto-fail on empty agent output.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock vscode module (unavailable outside extension host)
vi.mock("vscode", () => ({
  workspace: { workspaceFolders: [], getConfiguration: () => ({ get: () => undefined }) },
  Uri: { file: (p: string) => ({ fsPath: p }) },
  FileType: { Directory: 2, File: 1 },
  window: { tabGroups: { all: [] } },
  languages: { getDiagnostics: () => [] },
}));

import { VerifyNode } from "../agents/verify-node";
import { StreamHandler } from "../core/stream-handler";
import { McpBridge } from "../core/mcp-bridge";
import type { LlmProvider, LlmMessage, LlmOptions } from "../core/llm-provider";
import type { PipelineState, AgentOutput } from "../core/state";

// --- Mocks ---

function createMockStreamHandler(): StreamHandler {
  const emitFn = vi.fn();
  const handler = new StreamHandler(emitFn);
  vi.spyOn(handler, "emitStatus");
  vi.spyOn(handler, "emitComplete");
  vi.spyOn(handler, "emitError");
  vi.spyOn(handler, "emitRetry");
  vi.spyOn(handler, "emitVerify");
  return handler;
}

function createMockMcpBridge(): McpBridge {
  return {
    callTool: vi.fn(),
    listTools: vi.fn(),
    isAvailable: vi.fn().mockReturnValue(true),
  } as unknown as McpBridge;
}

function createMockLlmProvider(response: string): LlmProvider {
  return {
    type: "anthropic",
    chat: vi.fn().mockResolvedValue(response),
    chatStream: vi.fn(),
    isAvailable: vi.fn().mockResolvedValue(true),
    dispose: vi.fn(),
  };
}

function createBaseState(overrides: Partial<PipelineState> = {}): PipelineState {
  return {
    ticketKey: "KSA-233",
    threadId: "thread-1",
    currentPhase: "requirements",
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
    ...overrides,
  } as PipelineState;
}

// --- Tests ---

describe("VerifyNode (KSA-233)", () => {
  let streamHandler: StreamHandler;
  let mcpBridge: McpBridge;

  beforeEach(() => {
    streamHandler = createMockStreamHandler();
    mcpBridge = createMockMcpBridge();
  });

  it("TC-5: Verify passes on first check", async () => {
    const llmProvider = createMockLlmProvider(
      '{"passed": true, "feedback": ""}'
    );

    const verifyNode = new VerifyNode(
      "verify_ba_requirements", "ba-agent", mcpBridge, streamHandler, llmProvider
    );

    const agentOutput: AgentOutput = {
      nodeId: "ba-agent",
      content: "# BRD\n## User Stories\nAs a user...\nAs a admin...\nAs a dev...",
      timestamp: "2026-01-01T00:00:00Z",
    };

    const state = createBaseState({
      agentOutputs: [agentOutput],
      currentPhase: "requirements",
    });

    const result = await verifyNode.execute(state);

    expect(result.verifyPassed).toBe(true);
    expect(result.verifyFeedback).toBeNull();
    expect(streamHandler.emitVerify).toHaveBeenCalledWith(
      "verify_ba_requirements", true, null, 1, "stream-test"
    );
  });

  it("TC-6: Verify fails, returns feedback", async () => {
    const llmProvider = createMockLlmProvider(
      '{"passed": false, "feedback": "BRD missing acceptance criteria for Story 2"}'
    );

    const verifyNode = new VerifyNode(
      "verify_ba_requirements", "ba-agent", mcpBridge, streamHandler, llmProvider
    );

    const agentOutput: AgentOutput = {
      nodeId: "ba-agent",
      content: "# BRD\nIncomplete content",
      timestamp: "2026-01-01T00:00:00Z",
    };

    const state = createBaseState({
      agentOutputs: [agentOutput],
      currentPhase: "requirements",
    });

    const result = await verifyNode.execute(state);

    expect(result.verifyPassed).toBe(false);
    expect(result.verifyFeedback).toBe("BRD missing acceptance criteria for Story 2");
    expect(result.verifyAttempts).toEqual({ "ba-agent": 1 });
    expect(streamHandler.emitVerify).toHaveBeenCalledWith(
      "verify_ba_requirements", false, "BRD missing acceptance criteria for Story 2", 1, "stream-test"
    );
  });

  it("TC-11: VerifyNode itself errors → treated as pass (fail-open)", async () => {
    const llmProvider: LlmProvider = {
      type: "anthropic",
      chat: vi.fn().mockRejectedValue(new Error("LLM service unavailable")),
      chatStream: vi.fn(),
      isAvailable: vi.fn().mockResolvedValue(true),
      dispose: vi.fn(),
    };

    const verifyNode = new VerifyNode(
      "verify_ba_requirements", "ba-agent", mcpBridge, streamHandler, llmProvider
    );

    const agentOutput: AgentOutput = {
      nodeId: "ba-agent",
      content: "Some valid output",
      timestamp: "2026-01-01T00:00:00Z",
    };

    const state = createBaseState({
      agentOutputs: [agentOutput],
      currentPhase: "requirements",
    });

    // Suppress console.warn during this test
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await verifyNode.execute(state);

    expect(result.verifyPassed).toBe(true);
    expect(result.verifyFeedback).toBeNull();
    expect(streamHandler.emitVerify).toHaveBeenCalledWith(
      "verify_ba_requirements", true, null, 1, "stream-test"
    );

    warnSpy.mockRestore();
  });

  it("TC-12: No verify criteria configured → skip verify (pass through)", async () => {
    const llmProvider = createMockLlmProvider('should not be called');

    const verifyNode = new VerifyNode(
      "quality_gate_deployment", "devops-agent", mcpBridge, streamHandler, llmProvider
    );

    const agentOutput: AgentOutput = {
      nodeId: "devops-agent",
      content: "Deploy output",
      timestamp: "2026-01-01T00:00:00Z",
    };

    // Use "deployment" phase which has no criteria in VERIFY_CRITERIA
    const state = createBaseState({
      agentOutputs: [agentOutput],
      currentPhase: "deployment",
    });

    const result = await verifyNode.execute(state);

    expect(result.verifyPassed).toBe(true);
    expect(result.verifyFeedback).toBeNull();
    // LLM should NOT have been called since criteria is null
    expect(llmProvider.chat).not.toHaveBeenCalled();
  });

  it("EF-5: Agent output empty/null → auto verify fail", async () => {
    const llmProvider = createMockLlmProvider('should not be called');

    const verifyNode = new VerifyNode(
      "verify_ba_requirements", "ba-agent", mcpBridge, streamHandler, llmProvider
    );

    // No agent output for the target node
    const state = createBaseState({
      agentOutputs: [],
      currentPhase: "requirements",
    });

    const result = await verifyNode.execute(state);

    expect(result.verifyPassed).toBe(false);
    expect(result.verifyFeedback).toBe("No output produced by agent node");
    expect(llmProvider.chat).not.toHaveBeenCalled();
    expect(streamHandler.emitVerify).toHaveBeenCalledWith(
      "verify_ba_requirements", false, "No output produced by agent node", 1, "stream-test"
    );
  });

  it("EF-5 variant: Agent output with empty content → auto verify fail", async () => {
    const llmProvider = createMockLlmProvider('should not be called');

    const verifyNode = new VerifyNode(
      "verify_ba_requirements", "ba-agent", mcpBridge, streamHandler, llmProvider
    );

    const agentOutput: AgentOutput = {
      nodeId: "ba-agent",
      content: "",
      timestamp: "2026-01-01T00:00:00Z",
    };

    const state = createBaseState({
      agentOutputs: [agentOutput],
      currentPhase: "requirements",
    });

    const result = await verifyNode.execute(state);

    expect(result.verifyPassed).toBe(false);
    expect(result.verifyFeedback).toBe("No output produced by agent node");
  });
});
