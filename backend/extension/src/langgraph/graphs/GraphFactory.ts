/**
 * GraphFactory — Factory Pattern for building compiled LangGraph pipelines.
 * Centralizes graph construction with shared dependencies.
 */
import { McpBridge } from "../mcp-bridge";
import { StreamHandler } from "../stream-handler";
import { WorkspaceCheckpointer } from "../checkpointer";
import type { LlmProvider } from "../llm-provider";
import type { HookEngine } from "../hook-engine";
import { buildChatSubgraph } from "./chat-graph";
import { buildSdlcSubgraph } from "./sdlc-graph";
import { buildHotfixSubgraph } from "./hotfix-graph";
import { buildCodeReviewSubgraph } from "./code-review-graph";
import { buildDocsSubgraph } from "./docs-graph";
import { buildSecurityAuditSubgraph } from "./security-audit-graph";
import { PipelineState } from "../state";

export interface GraphDependencies {
    mcpBridge: McpBridge;
    streamHandler: StreamHandler;
    checkpointer: WorkspaceCheckpointer;
    llmProvider?: LlmProvider;
    hookEngine?: HookEngine;
    workspaceRoot?: string;
}

/** Common compiled graph interface — all graphs share PipelineState input/output */
export interface CompiledGraph {
    invoke(input: Partial<PipelineState>, config?: Record<string, unknown>): Promise<PipelineState>;
}

export class GraphFactory {
    constructor(private readonly deps: GraphDependencies) {}

    async buildChat(): Promise<CompiledGraph> {
        return buildChatSubgraph(
            this.deps.streamHandler,
            this.deps.llmProvider,
            this.deps.mcpBridge,
            this.deps.workspaceRoot,
            this.deps.hookEngine
        ) as unknown as CompiledGraph;
    }

    async buildSdlc(): Promise<CompiledGraph> {
        return buildSdlcSubgraph(
            this.deps.mcpBridge,
            this.deps.streamHandler,
            this.deps.checkpointer,
            this.deps.llmProvider
        ) as unknown as CompiledGraph;
    }

    async buildHotfix(): Promise<CompiledGraph> {
        return buildHotfixSubgraph(
            this.deps.mcpBridge,
            this.deps.streamHandler,
            this.deps.llmProvider
        ) as unknown as CompiledGraph;
    }

    async buildCodeReview(): Promise<CompiledGraph> {
        return buildCodeReviewSubgraph(
            this.deps.mcpBridge,
            this.deps.streamHandler,
            this.deps.llmProvider
        ) as unknown as CompiledGraph;
    }

    async buildDocs(): Promise<CompiledGraph> {
        return buildDocsSubgraph(
            this.deps.mcpBridge,
            this.deps.streamHandler,
            this.deps.llmProvider
        ) as unknown as CompiledGraph;
    }

    async buildSecurityAudit(): Promise<CompiledGraph> {
        return buildSecurityAuditSubgraph(
            this.deps.mcpBridge,
            this.deps.streamHandler,
            this.deps.llmProvider
        ) as unknown as CompiledGraph;
    }
}
