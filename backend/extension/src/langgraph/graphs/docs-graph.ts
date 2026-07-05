/**
 * Docs Subgraph — Documentation Generation Pipeline
 * Routes to the appropriate agent based on document type.
 *
 * Flow: __start__ → detect_doc_type → [BA|DEV|DevOps] → qa_verify → __end__
 */

import { StateGraph, END } from "@langchain/langgraph";
import { PipelineAnnotation, PipelineState } from "../state";
import { McpBridge } from "../mcp-bridge";
import { StreamHandler } from "../stream-handler";
import type { LlmProvider } from "../llm-provider";
import { BaNode } from "../nodes/ba-node";
import { DevNode } from "../nodes/dev-node";
import { DevOpsNode } from "../nodes/devops-node";
import { QaNode } from "../nodes/qa-node";

/**
 * Build the docs subgraph for document generation.
 */
export async function buildDocsSubgraph(
  mcpBridge: McpBridge,
  streamHandler: StreamHandler,
  llmProvider?: LlmProvider
) {
  const baNode = new BaNode("ba_docs", mcpBridge, streamHandler, llmProvider);
  const devNode = new DevNode("dev_docs", mcpBridge, streamHandler, llmProvider);
  const devopsNode = new DevOpsNode("devops_docs", mcpBridge, streamHandler, llmProvider);
  const qaNode = new QaNode("qa_verify_docs", mcpBridge, streamHandler, llmProvider);

  const graph = new StateGraph(PipelineAnnotation)
    // Detect what type of document is requested
    .addNode("detect_doc_type", async (state: PipelineState) => {
      const lastMessage = state.chatHistory?.[state.chatHistory.length - 1];
      const request = (lastMessage?.content || "").toLowerCase();

      let docType: string;
      if (/\b(ug|user\s*guide)\b/i.test(request)) {
        docType = "dev"; // User Guide → DEV
      } else if (/\b(dpg|deploy|deployment\s*guide|release\s*note|rln)\b/i.test(request)) {
        docType = "devops"; // Deployment Guide → DevOps
      } else if (/\b(brd|fsd|business|requirement|specification)\b/i.test(request)) {
        docType = "ba"; // Business docs → BA
      } else {
        docType = "dev"; // Default to DEV for general docs
      }

      return {
        parallelResults: { docType },
        lastUpdatedAt: new Date().toISOString(),
      };
    })

    // BA generates business documents
    .addNode("ba_generate", (state: PipelineState) => baNode.run(state))

    // DEV generates technical documents (UG, API docs)
    .addNode("dev_generate", (state: PipelineState) => devNode.run(state))

    // DevOps generates deployment documents
    .addNode("devops_generate", (state: PipelineState) => devopsNode.run(state))

    // QA verifies the document
    .addNode("qa_verify_docs", (state: PipelineState) => qaNode.run(state))

    .addEdge("__start__", "detect_doc_type")

    // Route to appropriate agent
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

    // All generators feed into QA verification
    .addEdge("ba_generate", "qa_verify_docs")
    .addEdge("dev_generate", "qa_verify_docs")
    .addEdge("devops_generate", "qa_verify_docs")
    .addEdge("qa_verify_docs", END);

  return graph.compile();
}
