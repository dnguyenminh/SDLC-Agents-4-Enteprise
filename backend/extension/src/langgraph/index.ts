/**
 * LangGraph Module — Multi-Graph Architecture
 * Public API exports for the SDLC pipeline orchestration engine.
 */

export { LangGraphEngine } from "./langgraph-engine";
export type { LlmProvider, LlmMessage, LlmOptions, LlmProviderType } from "./llm-provider";
export { createLlmProvider, createProviderByType } from "./providers";
export { McpBridge, McpToolTimeoutError } from "./mcp-bridge";
export { StreamHandler } from "./stream-handler";
export { WorkspaceCheckpointer } from "./checkpointer";
export { buildPipelineGraph } from "./graph-builder";

// Router exports
export { buildRouterGraph } from "./router/router-graph";
export { classifyIntent } from "./router/intent-classifier";
export type { IntentClassification } from "./router/router-state";

// Subgraph exports (for direct usage or testing)
export { buildSdlcSubgraph } from "./graphs/sdlc-graph";
export { buildChatSubgraph } from "./graphs/chat-graph";
export { buildHotfixSubgraph } from "./graphs/hotfix-graph";
export { buildCodeReviewSubgraph } from "./graphs/code-review-graph";
export { buildDocsSubgraph } from "./graphs/docs-graph";
export { buildSecurityAuditSubgraph } from "./graphs/security-audit-graph";

// Factory pattern
export { GraphFactory } from "./graphs/GraphFactory";
export type { GraphDependencies, CompiledGraph } from "./graphs/GraphFactory";

export type {
  PipelineState,
  SDLCPhase,
  PipelineIntent,
  PipelineStatus,
  ApprovalDecision,
  StreamEventType,
  DocumentState,
  AgentOutput,
  QualityGateCheckpoint,
  QualityGateResult,
  ChatMessage,
  PipelineError,
  PipelineGraphNode,
  PersistedPipelineInfo,
} from "./state";

export { PipelineAnnotation } from "./state";

export {
  routeFromSm,
  routeAfterNode,
  routeAfterApproval,
  routeAfterBaBrd,
  routeAfterTaEnrich,
  routeAfterSaTdd,
  routeAfterQaPlan,
  routeAfterDevCode,
  routeAfterUgJoin,
  routeAfterQaTest,
  routeAfterDevOpsDeploy,
  routeAfterFeedbackCheck,
  routeAfterBaFixFsd,
  routeAfterSaReview,
  routeAfterQualityGate,
  routeAfterDevUg,
  routeAfterBaReviewUg,
  routeAfterQaVerifyUg,
} from "./edges";
