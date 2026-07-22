import { StateGraph, END } from "@langchain/langgraph";
import { PipelineAnnotation, PipelineState } from "../core/state";
import { McpBridge } from "../core/mcp-bridge";
import { StreamHandler } from "../core/stream-handler";
import type { LlmProvider } from "../core/llm-provider";
import { SecurityNode } from "../agents/security-node";
import { DynamicAgentNode } from "../agents/dynamic-agent-node";
import { agentRegistry } from "../agents/registry";

export async function buildCodeReviewSubgraph(
  mcpBridge: McpBridge,
  streamHandler: StreamHandler,
  llmProvider?: LlmProvider
) {
  const securityNode = new SecurityNode("security_scan", mcpBridge, streamHandler, llmProvider);

  const qaCfg = agentRegistry.getAgentConfig("qa-agent");
  const qaReviewNode = qaCfg
    ? new DynamicAgentNode("quality_review", mcpBridge, streamHandler, qaCfg, llmProvider)
    : null;

  const graph = new StateGraph(PipelineAnnotation)
    .addNode("fetch_context", async (state: PipelineState) => {
      const streamId = state.currentStreamId || `stream-review-${Date.now()}`;
      streamHandler.emitStatus("fetch_context", "active", streamId);

      const lastMessage = state.chatHistory?.[state.chatHistory.length - 1];
      const reviewRequest = lastMessage?.content || "";

      let context = `Review request: ${reviewRequest}`;
      try {
        const diffResult = await mcpBridge.callTool("read_file", { path: reviewRequest }, 30_000);
        if (diffResult) {
          context = diffResult;
        }
      } catch (err) {
        console.debug(`[CodeReviewGraph] fetch_context context read failed (non-fatal): ${(err as Error).message}`);
      }

      streamHandler.emitComplete("fetch_context", 0, streamId);

      return {
        agentOutputs: [{
          nodeId: "fetch_context",
          content: context,
          timestamp: new Date().toISOString(),
          metadata: { action: "fetch_pr_context" },
        }],
        lastUpdatedAt: new Date().toISOString(),
      };
    })

    .addNode("security_scan", (state: PipelineState) => securityNode.run(state))
    .addNode("quality_review", (state: PipelineState) => qaReviewNode ? qaReviewNode.run(state) : Promise.resolve({}))

    .addNode("report", async (state: PipelineState) => {
      const streamId = state.currentStreamId || `stream-review-${Date.now()}`;
      streamHandler.emitStatus("report", "active", streamId);

      const outputs = state.agentOutputs || [];
      const securityFindings = outputs.find(o => o.nodeId === "security_scan")?.content || "No security issues found.";
      const qualityFindings = outputs.find(o => o.nodeId === "quality_review")?.content || "No quality issues found.";

      let report = `## Code Review Report\n\n### Security\n${securityFindings}\n\n### Quality\n${qualityFindings}`;

      if (llmProvider) {
        try {
          report = await llmProvider.chat(
            [
              { role: "system", content: "Summarize security and quality findings into a concise code review report. Use markdown format. Highlight critical issues first." },
              { role: "user", content: `Security findings:\n${securityFindings}\n\nQuality findings:\n${qualityFindings}` },
            ],
            { temperature: 0.3, maxTokens: 2048 }
          );
        } catch (err) {
          console.debug(`[CodeReviewGraph] LLM report generation failed, using basic report (non-fatal): ${(err as Error).message}`);
        }
      }

      streamHandler.emitComplete("report", 0, streamId);

      return {
        agentOutputs: [{
          nodeId: "report",
          content: report,
          timestamp: new Date().toISOString(),
          metadata: { action: "review_report" },
        }],
        pipelineStatus: "completed" as const,
        lastUpdatedAt: new Date().toISOString(),
      };
    })

    .addEdge("__start__", "fetch_context")
    .addEdge("fetch_context", "security_scan")
    .addEdge("security_scan", "quality_review")
    .addEdge("quality_review", "report")
    .addEdge("report", END);

  return graph.compile();
}

