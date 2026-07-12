import { StateGraph, END } from "@langchain/langgraph";
import { PipelineAnnotation, PipelineState } from "../core/state";
import { McpBridge } from "../core/mcp-bridge";
import { StreamHandler } from "../core/stream-handler";
import type { LlmProvider } from "../core/llm-provider";
import { DynamicAgentNode } from "../agents/dynamic-agent-node";
import { agentRegistry } from "../agents/registry";
import { HotfixVerifyNode } from "../agents/hotfix-verify-node";

const MAX_FIX_ATTEMPTS = 3;

export async function buildHotfixSubgraph(
  mcpBridge: McpBridge,
  streamHandler: StreamHandler,
  llmProvider?: LlmProvider
) {
  const devCfg = agentRegistry.getAgentConfig("dev-agent");
  const devopsCfg = agentRegistry.getAgentConfig("devops-agent");

  const devFixNode = devCfg
    ? new DynamicAgentNode("dev_fix", mcpBridge, streamHandler, devCfg, llmProvider)
    : null;
  const hotfixVerifyNode = new HotfixVerifyNode("hotfix_verify", mcpBridge, streamHandler, llmProvider);
  const deployNode = devopsCfg
    ? new DynamicAgentNode("deploy_hotfix", mcpBridge, streamHandler, devopsCfg, llmProvider)
    : null;

  const graph = new StateGraph(PipelineAnnotation)
    .addNode("analyze_bug", async (state: PipelineState) => {
      const streamId = state.currentStreamId || `stream-hotfix-${Date.now()}`;
      streamHandler.emitStatus("analyze_bug", "active", streamId);

      const lastMessage = state.chatHistory?.[state.chatHistory.length - 1];
      const bugDescription = lastMessage?.content || "";

      let analysis = `Bug report received: ${bugDescription}`;

      if (llmProvider) {
        try {
          analysis = await llmProvider.chat(
            [
              { role: "system", content: "You are a senior developer analyzing a bug report. Identify: 1) Root cause hypothesis, 2) Affected components, 3) Suggested fix approach. Be concise." },
              { role: "user", content: bugDescription },
            ],
            { temperature: 0.3, maxTokens: 1024 }
          );
        } catch {
          // Use basic analysis if LLM fails
        }
      }

      streamHandler.emitComplete("analyze_bug", 0, streamId);

      return {
        agentOutputs: [{
          nodeId: "analyze_bug",
          content: analysis,
          timestamp: new Date().toISOString(),
          metadata: { action: "bug_analysis" },
        }],
        currentPhase: "implementation" as const,
        lastUpdatedAt: new Date().toISOString(),
      };
    })

    .addNode("dev_fix", (state: PipelineState) => devFixNode ? devFixNode.run(state) : Promise.resolve({}))
    .addNode("hotfix_verify", (state: PipelineState) => hotfixVerifyNode.run(state))
    .addNode("deploy_hotfix", (state: PipelineState) => deployNode ? deployNode.run(state) : Promise.resolve({}))

    .addEdge("__start__", "analyze_bug")
    .addEdge("analyze_bug", "dev_fix")
    .addEdge("dev_fix", "hotfix_verify")

    .addConditionalEdges("hotfix_verify", (state: PipelineState) => {
      if (state.pipelineStatus === "failed" || state.verifyPassed === false) {
        const attempts = state.retryCount?.["dev_fix"] || 0;
        if (attempts >= MAX_FIX_ATTEMPTS) {
          return "__end__";
        }
        return "dev_fix";
      }
      return "deploy_hotfix";
    }, {
      dev_fix: "dev_fix",
      deploy_hotfix: "deploy_hotfix",
      __end__: END,
    })

    .addEdge("deploy_hotfix", END);

  return graph.compile();
}
