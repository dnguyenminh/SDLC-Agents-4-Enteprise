// Router Graph --- Multi-Graph Architecture --- classifies intent and routes to subgraphs
import { StateGraph, END } from "@langchain/langgraph";
import { PipelineAnnotation, PipelineState, PipelineIntent } from "../state";
import { McpBridge } from "../mcp-bridge";
import { StreamHandler } from "../stream-handler";
import { WorkspaceCheckpointer } from "../checkpointer";
import type { LlmProvider } from "../llm-provider";
import type { HookEngine } from "../hook-engine";
import { classifyIntent } from "./intent-classifier";

export async function buildRouterGraph(
  mcpBridge: McpBridge,
  streamHandler: StreamHandler,
  checkpointer: WorkspaceCheckpointer,
  llmProvider?: LlmProvider,
  hookEngine?: HookEngine
) {
  // Lazy-load subgraph invokers (only imported when needed)
  const subgraphCache = new Map<PipelineIntent, (state: PipelineState) => Promise<Partial<PipelineState>>>();

  async function getSubgraphInvoker(intent: PipelineIntent): Promise<(state: PipelineState) => Promise<Partial<PipelineState>>> {
    if (subgraphCache.has(intent)) {
      return subgraphCache.get(intent)!;
    }

    let invoker: (state: PipelineState) => Promise<Partial<PipelineState>>;

    switch (intent) {
      case "sdlc": {
        const { buildSdlcSubgraph } = await import("../graphs/sdlc-graph");
        const graph = await buildSdlcSubgraph(mcpBridge, streamHandler, checkpointer, llmProvider);
        invoker = async (state) => {
          const result = await graph.invoke(state, { configurable: { thread_id: state.threadId } });
          return result as Partial<PipelineState>;
        };
        break;
      }
      case "hotfix": {
        const { buildHotfixSubgraph } = await import("../graphs/hotfix-graph");
        const graph = await buildHotfixSubgraph(mcpBridge, streamHandler, llmProvider);
        invoker = async (state) => {
          const result = await graph.invoke(state);
          return result as Partial<PipelineState>;
        };
        break;
      }
      case "code_review": {
        const { buildCodeReviewSubgraph } = await import("../graphs/code-review-graph");
        const graph = await buildCodeReviewSubgraph(mcpBridge, streamHandler, llmProvider);
        invoker = async (state) => {
          const result = await graph.invoke(state);
          return result as Partial<PipelineState>;
        };
        break;
      }
      case "docs": {
        const { buildDocsSubgraph } = await import("../graphs/docs-graph");
        const graph = await buildDocsSubgraph(mcpBridge, streamHandler, llmProvider);
        invoker = async (state) => {
          const result = await graph.invoke(state);
          return result as Partial<PipelineState>;
        };
        break;
      }
      case "security_audit": {
        const { buildSecurityAuditSubgraph } = await import("../graphs/security-audit-graph");
        const graph = await buildSecurityAuditSubgraph(mcpBridge, streamHandler, llmProvider);
        invoker = async (state) => {
          const result = await graph.invoke(state);
          return result as Partial<PipelineState>;
        };
        break;
      }
      case "chat":
      default: {
        const { buildChatSubgraph } = await import("../graphs/chat-graph");
        const wsRoot = require("vscode").workspace.workspaceFolders?.[0]?.uri.fsPath || "";
        const graph = await buildChatSubgraph(streamHandler, llmProvider, mcpBridge, wsRoot, hookEngine);
        invoker = async (state) => {
          const result = await graph.invoke(state);
          return result as Partial<PipelineState>;
        };
        break;
      }
    }

    subgraphCache.set(intent, invoker);
    return invoker;
  }

  // === Build the router graph ===

  const graph = new StateGraph(PipelineAnnotation)
    // Node: classify user intent
    .addNode("classify_intent", async (state: PipelineState) => {
      const lastMessage = state.chatHistory?.[state.chatHistory.length - 1];
      const userInput = lastMessage?.content || state.ticketKey || "";

      // If intent is already set (pre-classified by engine), skip classification
      if (state.intent) {
        return { lastUpdatedAt: new Date().toISOString() };
      }

      const classification = await classifyIntent(userInput, llmProvider);
      return {
        intent: classification.intent,
        lastUpdatedAt: new Date().toISOString(),
      };
    })

    // Node: SDLC subgraph
    .addNode("sdlc_subgraph", async (state: PipelineState) => {
      const invoker = await getSubgraphInvoker("sdlc");
      return invoker(state);
    })

    // Node: Hotfix subgraph
    .addNode("hotfix_subgraph", async (state: PipelineState) => {
      const invoker = await getSubgraphInvoker("hotfix");
      return invoker(state);
    })

    // Node: Code review subgraph
    .addNode("code_review_subgraph", async (state: PipelineState) => {
      const invoker = await getSubgraphInvoker("code_review");
      return invoker(state);
    })

    // Node: Docs subgraph
    .addNode("docs_subgraph", async (state: PipelineState) => {
      const invoker = await getSubgraphInvoker("docs");
      return invoker(state);
    })

    // Node: Security audit subgraph
    .addNode("security_audit_subgraph", async (state: PipelineState) => {
      const invoker = await getSubgraphInvoker("security_audit");
      return invoker(state);
    })

    // Node: Chat subgraph
    .addNode("chat_subgraph", async (state: PipelineState) => {
      const invoker = await getSubgraphInvoker("chat");
      return invoker(state);
    })

    // Entry: start → classify
    .addEdge("__start__", "classify_intent")

    // Conditional routing from classifier to subgraphs
    .addConditionalEdges("classify_intent", routeByIntent, {
      sdlc_subgraph: "sdlc_subgraph",
      hotfix_subgraph: "hotfix_subgraph",
      code_review_subgraph: "code_review_subgraph",
      docs_subgraph: "docs_subgraph",
      security_audit_subgraph: "security_audit_subgraph",
      chat_subgraph: "chat_subgraph",
    })

    // All subgraphs terminate to END
    .addEdge("sdlc_subgraph", END)
    .addEdge("hotfix_subgraph", END)
    .addEdge("code_review_subgraph", END)
    .addEdge("docs_subgraph", END)
    .addEdge("security_audit_subgraph", END)
    .addEdge("chat_subgraph", END);

  return graph.compile({ checkpointer });
}

function routeByIntent(state: PipelineState): string {
  switch (state.intent) {
    case "sdlc":
      return "sdlc_subgraph";
    case "hotfix":
      return "hotfix_subgraph";
    case "code_review":
      return "code_review_subgraph";
    case "docs":
      return "docs_subgraph";
    case "security_audit":
      return "security_audit_subgraph";
    case "chat":
    default:
      return "chat_subgraph";
  }
}
