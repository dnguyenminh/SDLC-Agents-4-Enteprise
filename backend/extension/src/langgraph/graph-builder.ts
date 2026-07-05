/**
 * Graph Builder — Multi-Graph Architecture
 * Builds the ROUTER graph that classifies intent and delegates to subgraphs.
 * Replaces the previous monolithic SDLC graph with a multi-graph architecture.
 *
 * Architecture:
 *   Router Graph → classify_intent → route to subgraph:
 *     sdlc → Full SDLC pipeline (graphs/sdlc-graph.ts)
 *     hotfix → Bug fix fast-track (graphs/hotfix-graph.ts)
 *     code_review → PR review pipeline (graphs/code-review-graph.ts)
 *     docs → Documentation generation (graphs/docs-graph.ts)
 *     security_audit → Security scanning (graphs/security-audit-graph.ts)
 *     chat → Free-form LLM chat (graphs/chat-graph.ts)
 */

import { McpBridge } from "./mcp-bridge";
import { StreamHandler } from "./stream-handler";
import { WorkspaceCheckpointer } from "./checkpointer";
import type { LlmProvider } from "./llm-provider";
import type { HookEngine } from "./hook-engine";
import { buildRouterGraph } from "./router/router-graph";

/**
 * Build and compile the pipeline graph.
 * Now builds the ROUTER graph which handles intent classification and subgraph delegation.
 * Subgraphs are lazy-loaded on first use (zero activation impact for unused pipelines).
 */
export async function buildPipelineGraph(
  mcpBridge: McpBridge,
  streamHandler: StreamHandler,
  checkpointer: WorkspaceCheckpointer,
  llmProvider?: LlmProvider,
  hookEngine?: HookEngine
) {
  return buildRouterGraph(mcpBridge, streamHandler, checkpointer, llmProvider, hookEngine);
}
