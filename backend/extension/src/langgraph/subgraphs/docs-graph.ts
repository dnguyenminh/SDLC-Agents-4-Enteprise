import { StateGraph, END } from "@langchain/langgraph";
import { PipelineAnnotation, PipelineState } from "../core/state";
import { McpBridge } from "../core/mcp-bridge";
import { StreamHandler } from "../core/stream-handler";
import type { LlmProvider } from "../core/llm-provider";
import { DynamicAgentNode } from "../agents/dynamic-agent-node";
import { agentRegistry } from "../agents/registry";

export async function buildDocsSubgraph(
  mcpBridge: McpBridge,
  streamHandler: StreamHandler,
  llmProvider?: LlmProvider
) {
  const baCfg = agentRegistry.getAgentConfig("ba-agent");
  const devCfg = agentRegistry.getAgentConfig("dev-agent");
  const devopsCfg = agentRegistry.getAgentConfig("devops-agent");
  const qaCfg = agentRegistry.getAgentConfig("qa-agent");

  const baDocNode = baCfg
    ? new DynamicAgentNode("ba_docs", mcpBridge, streamHandler, baCfg, llmProvider)
    : null;
  const devDocNode = devCfg
    ? new DynamicAgentNode("dev_docs", mcpBridge, streamHandler, devCfg, llmProvider)
    : null;
  const devopsDocNode = devopsCfg
    ? new DynamicAgentNode("devops_docs", mcpBridge, streamHandler, devopsCfg, llmProvider)
    : null;
  const qaVerifyDocNode = qaCfg
    ? new DynamicAgentNode("qa_verify_docs", mcpBridge, streamHandler, qaCfg, llmProvider)
    : null;

  const graph = new StateGraph(PipelineAnnotation)
    .addNode("detect_doc_type", async (state: PipelineState) => {
      const lastMessage = state.chatHistory?.[state.chatHistory.length - 1];
      const request = (lastMessage?.content || "").toLowerCase();

      let docType: string;
      if (/\b(ug|user\s*guide)\b/i.test(request)) {
        docType = "dev";
      } else if (/\b(dpg|deploy|deployment\s*guide|release\s*note|rln)\b/i.test(request)) {
        docType = "devops";
      } else if (/\b(brd|fsd|business|requirement|specification)\b/i.test(request)) {
        docType = "ba";
      } else {
        docType = "dev";
      }

      return {
        parallelResults: { docType },
        lastUpdatedAt: new Date().toISOString(),
      };
    })

    .addNode("ba_generate", (state: PipelineState) => baDocNode ? baDocNode.run(state) : Promise.resolve({}))
    .addNode("dev_generate", (state: PipelineState) => devDocNode ? devDocNode.run(state) : Promise.resolve({}))
    .addNode("devops_generate", (state: PipelineState) => devopsDocNode ? devopsDocNode.run(state) : Promise.resolve({}))
    .addNode("qa_verify_docs", (state: PipelineState) => qaVerifyDocNode ? qaVerifyDocNode.run(state) : Promise.resolve({}))

    .addEdge("__start__", "detect_doc_type")

    .addConditionalEdges("detect_doc_type", (state: PipelineState) => {
      const docType = state.parallelResults?.docType || "dev";
      switch (docType) {
        case "ba": return "ba_generate";
        case "devops": return "devops_generate";
        default: return "dev_generate";
      }
    }, {
      ba_generate: "ba_generate",
      dev_generate: "dev_generate",
      devops_generate: "devops_generate",
    })

    .addEdge("ba_generate", "qa_verify_docs")
    .addEdge("dev_generate", "qa_verify_docs")
    .addEdge("devops_generate", "qa_verify_docs")
    .addEdge("qa_verify_docs", END);

  return graph.compile();
}
