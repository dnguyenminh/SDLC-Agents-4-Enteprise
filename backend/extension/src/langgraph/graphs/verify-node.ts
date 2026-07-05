/**
 * VerifyResponse node — self-review mechanism for chat agent.
 * Evaluates if response is complete, routes to retry or end.
 */

import { PipelineState } from "../state";
import { StreamHandler } from "../stream-handler";
import type { LlmProvider, LlmMessage } from "../llm-provider";
import { DEFAULT_VERIFY_PROMPT, buildVerifyMessages } from "./verify-prompt";
import { debugLog } from "../../debug-logger";

const MAX_VERIFY_RETRIES = 5;
const VERIFY_TIMEOUT_MS = 15000;

export interface VerifyResult {
  verdict: "complete" | "incomplete" | "tool_needed";
  feedback?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
}

export function createVerifyResponseNode(
  llmProvider: LlmProvider | undefined,
  streamHandler: StreamHandler,
  verifyPrompt?: string
) {
  const prompt = verifyPrompt || DEFAULT_VERIFY_PROMPT;

  return async (state: PipelineState): Promise<Partial<PipelineState>> => {
    const verifyCount = (state.agentIterations || 0);
    if (!llmProvider || verifyCount >= MAX_VERIFY_RETRIES) {
      return { lastUpdatedAt: new Date().toISOString() };
    }

    const lastOutput = state.agentOutputs?.at(-1);
    const agentResponse = lastOutput?.content || "";
    const userRequest = (state.chatHistory || [])
      .filter(m => m.role === "user").pop()?.content || "";

    if (!agentResponse || !userRequest) {
      return { lastUpdatedAt: new Date().toISOString() };
    }

    // Don't verify very short responses (likely "ok", "done", etc.)
    if (agentResponse.length < 20) {
      return { lastUpdatedAt: new Date().toISOString() };
    }

    try {
      const messages = buildVerifyMessages(
        userRequest,
        agentResponse.slice(0, 2000),
        prompt
      );

      const timeoutPromise = new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error("verify timeout")), VERIFY_TIMEOUT_MS)
      );

      debugLog(`[VERIFY-REQ] userRequest="${userRequest.slice(0, 80)}", agentResponse="${agentResponse.slice(0, 100)}"`);

      const verdictRaw = await Promise.race([
        llmProvider.chat(messages as LlmMessage[], { maxTokens: 100, temperature: 0 }),
        timeoutPromise,
      ]);

      debugLog(`[VERIFY-RES] raw="${verdictRaw.trim()}"`);

      const result = parseVerdict(verdictRaw.trim());

      streamHandler.emitDirect({
        type: "chat:toolCall",
        toolCall: {
          id: `verify-${Date.now()}`,
          name: "verify_response",
          args: { verdict: result.verdict, feedback: result.feedback || "" },
          status: "completed",
          result: verdictRaw.slice(0, 100),
          duration: 0,
        },
      } as any);

      if (result.verdict === "complete") {
        debugLog(`[verify] Response is COMPLETE`);
        return { lastUpdatedAt: new Date().toISOString() };
      }

      if (result.verdict === "tool_needed" && result.toolName) {
        debugLog(`[verify] TOOL_NEEDED: ${result.toolName}`);
        return {
          toolCalls: [{
            id: `verify-tc-${Date.now()}`,
            name: result.toolName,
            arguments: result.toolArgs || {},
          }],
          agentOutputs: [],
          agentIterations: verifyCount + 1,
          lastUpdatedAt: new Date().toISOString(),
        } as Partial<PipelineState>;
      }

      // INCOMPLETE — add feedback and retry
      debugLog(`[verify] INCOMPLETE: ${result.feedback}`);
      const feedbackMsg: LlmMessage = {
        role: "user",
        content: `[SYSTEM REVIEW: Your response was incomplete. ${result.feedback}. Please try again using tools.]`,
      };

      // Append feedback to existing scratchpad (reducer replaces, so we accumulate here)
      const updatedScratchpad: LlmMessage[] = [...(state.agentScratchpad || []), feedbackMsg];

      return {
        agentScratchpad: updatedScratchpad,
        agentOutputs: [],
        agentIterations: verifyCount + 1,
        lastUpdatedAt: new Date().toISOString(),
      } as Partial<PipelineState>;
    } catch (err) {
      debugLog(`[verify] Error: ${(err as Error).message} — skipping verify`);
      return { lastUpdatedAt: new Date().toISOString() };
    }
  };
}

function parseVerdict(raw: string): VerifyResult {
  const upper = raw.toUpperCase();
  if (upper.startsWith("COMPLETE")) {
    return { verdict: "complete" };
  }
  if (upper.startsWith("TOOL_NEEDED:")) {
    const rest = raw.slice("TOOL_NEEDED:".length).trim();
    const spaceIdx = rest.indexOf(" ");
    if (spaceIdx > 0) {
      const toolName = rest.slice(0, spaceIdx);
      let toolArgs: Record<string, unknown> = {};
      try { toolArgs = JSON.parse(rest.slice(spaceIdx + 1)); } catch { /* empty */ }
      return { verdict: "tool_needed", toolName, toolArgs };
    }
    return { verdict: "tool_needed", toolName: rest || "list_directory", toolArgs: { path: "src", recursive: true } };
  }
  if (upper.startsWith("INCOMPLETE")) {
    // Treat INCOMPLETE as TOOL_NEEDED with list_directory fallback
    return { verdict: "tool_needed", toolName: "list_directory", toolArgs: { path: "src", recursive: true } };
  }
  // Default: treat as complete (don't infinite loop)
  return { verdict: "complete" };
}

export function routeAfterVerify(state: PipelineState): string {
  // If LLM failed (server down), stop immediately — don't loop back
  if (state.pipelineStatus === "failed" || (state.errors && state.errors.length > 0)) {
    return "__end__";
  }
  if (state.toolCalls && state.toolCalls.length > 0) {
    return "execute_tools";
  }
  if (!state.agentOutputs || state.agentOutputs.length === 0) {
    return "agent_step";
  }
  return "__end__";
}
