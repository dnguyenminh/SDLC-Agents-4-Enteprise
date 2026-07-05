/**
 * Hotfix Subgraph — Bug Fix Fast-Track Pipeline
 * Streamlined graph for urgent bug fixes without full SDLC ceremony.
 *
 * Flow: __start__ → analyze_bug → dev_fix → qa_verify → [pass?]
 *   pass → deploy_hotfix → __end__
 *   fail → dev_fix (loop, max 3)
 */

import { StateGraph, END } from "@langchain/langgraph";
import { PipelineAnnotation, PipelineState } from "../state";
import { McpBridge } from "../mcp-bridge";
import { StreamHandler } from "../stream-handler";
import type { LlmProvider } from "../llm-provider";
import { DevNode } from "../nodes/dev-node";
import { QaNode } from "../nodes/qa-node";
import { DevOpsNode } from "../nodes/devops-node";

/** Maximum fix attempts before escalation */
const MAX_FIX_ATTEMPTS = 3;

/**
 * Build the hotfix subgraph for fast-track bug resolution.
 */
export async function buildHotfixSubgraph(
  mcpBridge: McpBridge,
  streamHandler: StreamHandler,
  llmProvider?: LlmProvider
) {
  const devNode = new DevNode("dev_fix", mcpBridge, streamHandler, llmProvider);
  const qaNode = new QaNode("qa_verify", mcpBridge, streamHandler, llmProvider);
  const devopsNode = new DevOpsNode("deploy_hotfix", mcpBridge, streamHandler, llmProvider);

  const graph = new StateGraph(PipelineAnnotation)
    // Analyze bug description using LLM
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

    // DEV fixes the code
    .addNode("dev_fix", (state: PipelineState) => devNode.run(state))

    // QA verifies the fix
    .addNode("qa_verify", (state: PipelineState) => qaNode.run(state))

    // DevOps deploys the patch
    .addNode("deploy_hotfix", (state: PipelineState) => devopsNode.run(state))

    // Entry
    .addEdge("__start__", "analyze_bug")
    .addEdge("analyze_bug", "dev_fix")
    .addEdge("dev_fix", "qa_verify")

    // After QA: pass → deploy, fail → loop back to dev
    .addConditionalEdges("qa_verify", (state: PipelineState) => {
      if (state.pipelineStatus === "failed") {
        const attempts = state.retryCount?.["dev_fix"] || 0;
        if (attempts >= MAX_FIX_ATTEMPTS) {
          return "__end__"; // Escalate — max attempts reached
        }
        return "dev_fix"; // Loop back for another attempt
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
