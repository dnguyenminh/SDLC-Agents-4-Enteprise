/**
 * RAG Grader Nodes — Corrective RAG / Self-RAG pattern for small models.
 *
 * Two grading nodes that prevent hallucination when using small LLMs (Gemma, Phi, etc.):
 *
 * 1. RetrieveEvaluator: After KB retrieval, checks if documents are relevant.
 *    If irrelevant → triggers re-search with refined query or web fallback.
 *
 * 2. HallucinationGrader: After LLM generates answer, checks if it's grounded
 *    in source documents. If hallucinated → loops back to re-generate.
 *
 * These nodes are ONLY activated for small-context models (contextWindow < 32K).
 * Large models (Claude, GPT-4) have sufficient reasoning to self-correct.
 */

import { PipelineState } from "../state";
import { StreamHandler } from "../stream-handler";
import type { LlmProvider, LlmMessage } from "../llm-provider";
import { buildRetrieveEvalMessages, buildHallucinationGraderMessages } from "./rag-grader-prompts";
import { debugLog } from "../../debug-logger";

const GRADER_TIMEOUT_MS = 10000;
const MAX_HALLUCINATION_RETRIES = 2;

export interface RagGraderConfig {
  /** Enable retrieve evaluation (filter irrelevant KB results) */
  enableRetrieveEval: boolean;
  /** Enable hallucination grading (verify answer is grounded) */
  enableHallucinationGrade: boolean;
  /** Max retries for hallucination loop */
  maxRetries: number;
}

/** Default config: both enabled for small models */
export function getDefaultRagGraderConfig(contextWindow: number): RagGraderConfig {
  const isSmallModel = contextWindow > 0 && contextWindow <= 32768;
  return {
    enableRetrieveEval: isSmallModel,
    enableHallucinationGrade: isSmallModel,
    maxRetries: MAX_HALLUCINATION_RETRIES,
  };
}

/**
 * Evaluate retrieved documents for relevance.
 * Called after tool results come back from mem_search.
 * Returns filtered results (only relevant ones) or triggers re-search.
 */
export function createRetrieveEvaluatorNode(
  llmProvider: LlmProvider | undefined,
  streamHandler: StreamHandler,
  config: RagGraderConfig
) {
  return async (state: PipelineState): Promise<Partial<PipelineState>> => {
    if (!config.enableRetrieveEval || !llmProvider) {
      return { lastUpdatedAt: new Date().toISOString() };
    }

    // Find the last tool result from mem_search/kb_search
    const toolResults = state.toolResults || [];
    const kbResults = toolResults.filter(r =>
      r.name === "mem_search" || r.name === "kb_search"
    );

    if (kbResults.length === 0) {
      return { lastUpdatedAt: new Date().toISOString() };
    }

    const lastKbResult = kbResults[kbResults.length - 1];
    const userQuery = (state.chatHistory || [])
      .filter(m => m.role === "user").pop()?.content || "";

    if (!userQuery || !lastKbResult.content) {
      return { lastUpdatedAt: new Date().toISOString() };
    }

    // Skip evaluation if result is empty or error
    if (lastKbResult.content.startsWith("Error") || lastKbResult.content.length < 50) {
      return { lastUpdatedAt: new Date().toISOString() };
    }

    try {
      const messages = buildRetrieveEvalMessages(userQuery, lastKbResult.content);
      const verdict = await Promise.race([
        llmProvider.chat(messages as LlmMessage[], { maxTokens: 10, temperature: 0 }),
        new Promise<string>((_, rej) => setTimeout(() => rej(new Error("timeout")), GRADER_TIMEOUT_MS)),
      ]);

      const isRelevant = verdict.trim().toUpperCase().startsWith("RELEVANT");
      debugLog(`[retrieve-eval] query="${userQuery.slice(0, 60)}", verdict=${isRelevant ? "RELEVANT" : "IRRELEVANT"}`);

      streamHandler.emitDirect({
        type: "chat:toolCall",
        toolCall: {
          id: `rag-eval-${Date.now()}`,
          name: "retrieve_evaluator",
          args: { verdict: isRelevant ? "relevant" : "irrelevant" },
          status: "completed",
          result: verdict.trim().slice(0, 50),
          duration: 0,
        },
      } as any);

      if (!isRelevant) {
        // Document is irrelevant — inject feedback to re-search with refined query
        const feedbackMsg: LlmMessage = {
          role: "user",
          content: `[SYSTEM: The KB search result was NOT relevant to your question. Try a different search query or use other tools (read_file, list_directory) to find the information directly from source code.]`,
        };
        const updatedScratchpad = [...(state.agentScratchpad || []), feedbackMsg];
        return {
          agentScratchpad: updatedScratchpad,
          agentOutputs: [],
          lastUpdatedAt: new Date().toISOString(),
        };
      }

      return { lastUpdatedAt: new Date().toISOString() };
    } catch (err) {
      debugLog(`[retrieve-eval] Error: ${(err as Error).message} — skipping`);
      return { lastUpdatedAt: new Date().toISOString() };
    }
  };
}

/**
 * Grade the final answer for hallucination.
 * Checks if the generated response is grounded in tool results / KB documents.
 * If hallucinated → injects feedback and loops back to agent_step.
 */
export function createHallucinationGraderNode(
  llmProvider: LlmProvider | undefined,
  streamHandler: StreamHandler,
  config: RagGraderConfig
) {
  return async (state: PipelineState): Promise<Partial<PipelineState>> => {
    if (!config.enableHallucinationGrade || !llmProvider) {
      return { lastUpdatedAt: new Date().toISOString() };
    }

    const lastOutput = state.agentOutputs?.at(-1);
    const answer = lastOutput?.content || "";

    // Skip grading for short responses or no-tool responses
    if (!answer || answer.length < 100) {
      return { lastUpdatedAt: new Date().toISOString() };
    }

    // Check retry count — avoid infinite loops
    const retryKey = "hallucination_retries";
    const currentRetries = state.verifyAttempts?.[retryKey] || 0;
    if (currentRetries >= config.maxRetries) {
      debugLog(`[hallucination-grader] Max retries (${config.maxRetries}) reached — accepting answer`);
      return { lastUpdatedAt: new Date().toISOString() };
    }

    // Gather source documents from scratchpad (tool results)
    const sourceDocParts: string[] = [];
    for (const msg of (state.agentScratchpad || [])) {
      if (msg.role === "tool" && msg.content) {
        sourceDocParts.push(`[${msg.toolName || "tool"}]: ${msg.content.slice(0, 1500)}`);
      }
    }

    // If no source docs in scratchpad, nothing to grade against
    if (sourceDocParts.length === 0) {
      return { lastUpdatedAt: new Date().toISOString() };
    }

    const sourceDocs = sourceDocParts.join("\n---\n");

    try {
      const messages = buildHallucinationGraderMessages(sourceDocs, answer);
      const verdict = await Promise.race([
        llmProvider.chat(messages as LlmMessage[], { maxTokens: 10, temperature: 0 }),
        new Promise<string>((_, rej) => setTimeout(() => rej(new Error("timeout")), GRADER_TIMEOUT_MS)),
      ]);

      const isGrounded = verdict.trim().toUpperCase().startsWith("GROUNDED");
      debugLog(`[hallucination-grader] verdict=${isGrounded ? "GROUNDED" : "HALLUCINATED"}, retries=${currentRetries}`);

      streamHandler.emitDirect({
        type: "chat:toolCall",
        toolCall: {
          id: `hallucination-${Date.now()}`,
          name: "hallucination_grader",
          args: { verdict: isGrounded ? "grounded" : "hallucinated", retry: currentRetries },
          status: "completed",
          result: verdict.trim().slice(0, 50),
          duration: 0,
        },
      } as any);

      if (isGrounded) {
        return { lastUpdatedAt: new Date().toISOString() };
      }

      // HALLUCINATED — inject correction feedback and loop back
      const feedbackMsg: LlmMessage = {
        role: "user",
        content: `[SYSTEM: Your previous answer contained information NOT found in the source documents. Re-read the tool results carefully and generate a new answer that ONLY uses facts from those results. Do not invent code, paths, or details.]`,
      };
      const updatedScratchpad = [...(state.agentScratchpad || []), feedbackMsg];

      return {
        agentScratchpad: updatedScratchpad,
        agentOutputs: [],
        verifyAttempts: { ...state.verifyAttempts, [retryKey]: currentRetries + 1 },
        lastUpdatedAt: new Date().toISOString(),
      };
    } catch (err) {
      debugLog(`[hallucination-grader] Error: ${(err as Error).message} — skipping`);
      return { lastUpdatedAt: new Date().toISOString() };
    }
  };
}

/**
 * Routing function after hallucination grading.
 * If agentOutputs is empty (cleared by grader) → re-run agent_step.
 * Otherwise → proceed to __end__.
 */
export function routeAfterHallucinationGrade(state: PipelineState): string {
  if (!state.agentOutputs || state.agentOutputs.length === 0) {
    return "agent_step";
  }
  return "__end__";
}

/**
 * Routing function after retrieve evaluation.
 * If agentOutputs cleared → re-run agent_step (to re-search).
 * Otherwise → continue to agent_step normally.
 */
export function routeAfterRetrieveEval(state: PipelineState): string {
  return "agent_step";
}
