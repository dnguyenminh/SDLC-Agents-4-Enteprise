import { McpBridge } from "../core/mcp-bridge";
import { StreamHandler } from "../core/stream-handler";
import type { LlmProvider } from "../core/llm-provider";
import type { SDLCPhase } from "../core/state";
import { agentRegistry } from "../agents/registry";
import { DynamicAgentNode } from "../agents/dynamic-agent-node";
import { FeedbackNode } from "../agents/feedback-node";
import { ApprovalNode } from "../agents/approval-node";
import { VerifyNode } from "../agents/verify-node";
import { AnalyzeInputNode } from "../agents/analyze-input-node";

export interface SdlcNodes {
  analyzeInputNode: AnalyzeInputNode;
  dynamicNodes: Record<string, DynamicAgentNode>;
  agentNodes: Record<string, DynamicAgentNode>;
  verifyNodes: Record<string, VerifyNode>;
  gateNodes: Record<string, ApprovalNode>;
  feedbackNode: FeedbackNode;
}

export function createSdlcNodes(
  mcpBridge: McpBridge,
  streamHandler: StreamHandler,
  llmProvider?: LlmProvider
): SdlcNodes {
  const dynamicNodes: Record<string, DynamicAgentNode> = {};
  const agentNodes: Record<string, DynamicAgentNode> = {};
  const verifyNodes: Record<string, VerifyNode> = {};
  const gateNodes: Record<string, ApprovalNode> = {};

  const allIds = agentRegistry.getAllAgentIds();

  for (const id of allIds) {
    const config = agentRegistry.getAgentConfig(id);
    if (!config) continue;

    switch (config.type) {
      case "agent":
        const node = new DynamicAgentNode(id, mcpBridge, streamHandler, config, llmProvider);
        dynamicNodes[id] = node;
        agentNodes[id] = node;
        break;
      case "verify":
        verifyNodes[id] = new VerifyNode(id, config.targetNode || "", mcpBridge, streamHandler, llmProvider);
        break;
      case "gate":
        gateNodes[id] = new ApprovalNode(id, config.phase as SDLCPhase, mcpBridge, streamHandler, llmProvider);
        break;
    }
  }

  return {
    analyzeInputNode: new AnalyzeInputNode("analyze_input", mcpBridge, streamHandler, llmProvider),
    dynamicNodes,
    agentNodes,
    verifyNodes,
    gateNodes,
    feedbackNode: new FeedbackNode("feedback_check", mcpBridge, streamHandler, llmProvider),
  };
}
