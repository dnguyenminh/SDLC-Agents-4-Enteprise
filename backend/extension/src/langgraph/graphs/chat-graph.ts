/**
 * Chat Subgraph — ReAct Agent Loop with Full MCP Tool Calling
 * Flow: __start__ -> fetch_tools -> agent_step -> [route]
 *   - tool_use -> execute_tools -> [route] -> agent_step (loop) or synthesize
 *   - text -> verify_response -> [COMPLETE] -> __end__
 *                              -> [INCOMPLETE] -> agent_step (retry)
 *                              -> [TOOL_NEEDED] -> execute_tools
 */

import { StateGraph, END } from "@langchain/langgraph";
import { PipelineAnnotation, PipelineState } from "../state";
import { StreamHandler } from "../stream-handler";
import { McpBridge } from "../mcp-bridge";
import { ToolRegistry } from "../tool-registry";
import type { LlmProvider } from "../llm-provider";
import { loadSteeringRules, injectSteering } from "../steering-loader";
import { HookEngine } from "../hook-engine";
import { debugLog } from "../../debug-logger";
import {
  createFetchToolsNode, createAgentStepNode,
  createExecuteToolsNode, createSynthesizeNode,
} from "./chat-graph-nodes";
import { createVerifyResponseNode, routeAfterVerify } from "./verify-node";
import {
  createRetrieveEvaluatorNode, createHallucinationGraderNode,
  routeAfterHallucinationGrade, getDefaultRagGraderConfig,
} from "./rag-grader-nodes";

const MAX_AGENT_ITERATIONS = 25;

const AGENT_SYSTEM_PROMPT = `You are a coding assistant with access to workspace tools. You can read files, search code, and list directories.

## CRITICAL RULES:
1. ALWAYS use tools FIRST before answering questions about code or the project
2. NEVER say "please provide a file path" — use list_directory and read_file yourself
3. When user asks about code: call list_directory to find files, then read_file to read them
4. When user asks to review code: read the code first, THEN give your review
5. After list_directory results: IMMEDIATELY call read_file on source files you found. Do NOT respond with text asking for clarification.

## AVAILABLE TOOLS:
- list_directory: List files in a directory (use path="." for project root, path="src" for source)
- read_file: Read file content by path
- write_file: Write/create files (path + content)
- search_text: Search for text patterns across files
- get_diagnostics: Check for errors in files

## WORKFLOW:
1. User asks question → call list_directory(path=".") to see TOP-LEVEL only
2. See folder names → call list_directory(path="src") or specific subfolder
3. See files → call read_file with start_line/end_line for RELEVANT SECTION ONLY
4. Have enough info → synthesize response
5. NEVER read entire large files. Use line ranges: read_file(path="x", start_line=1, end_line=80)
6. You CAN call tools multiple times — each call gives you more context

## AFTER list_directory: WHAT TO DO NEXT
- See "src/" or "backend/" folder? → read_file on entry point (index.ts, main.ts, extension.ts, app.ts)
- See specific .ts/.js/.kt/.py files? → read_file on 2-3 most important ones
- Not sure which file? → grep_search for "export" or "class" to find key modules
- NEVER say "which file do you want me to review" — just pick the main source files

## RESPONSE STYLE:
- Keep responses concise (5-15 sentences)
- Use bullet points
- Respond in same language as user
- After reading code: give specific feedback with line references`;

function routeAgentStep(state: PipelineState): string {
  // Circuit breaker: if pipeline already failed (e.g., LLM crash/context exceeded), stop immediately
  if (state.pipelineStatus === "failed") {
    debugLog(`[graph] routeAgentStep: pipeline FAILED -> verify_response (will route to __end__)`);
    return "verify_response";
  }
  if (state.toolCalls && state.toolCalls.length > 0) {
    debugLog(`[graph] routeAgentStep: ${state.toolCalls.length} toolCalls -> execute_tools`);
    return "execute_tools";
  }
  debugLog(`[graph] routeAgentStep: text response -> verify_response`);
  return "verify_response";
}

function routeAfterToolExec(state: PipelineState): string {
  // Stop if pipeline failed (LLM crash during tool execution cycle)
  if (state.pipelineStatus === "failed") return "synthesize";
  if ((state.agentIterations || 0) >= MAX_AGENT_ITERATIONS) return "synthesize";
  return "agent_step";
}

export async function buildChatSubgraph(
  streamHandler: StreamHandler,
  llmProvider?: LlmProvider,
  mcpBridge?: McpBridge,
  workspaceRoot?: string,
  hookEngine?: HookEngine
) {
  const toolRegistry = mcpBridge ? new ToolRegistry(mcpBridge) : null;
  const wsRoot = workspaceRoot || require("vscode").workspace.workspaceFolders?.[0]?.uri.fsPath || "";

  // Detect context window for budget-aware message building
  const contextWindow = llmProvider?.getContextWindow() || 0;
  if (contextWindow > 0) {
    debugLog(`[chat-graph] Context window detected: ${contextWindow} tokens`);
  }

  let enrichedSystemPrompt = AGENT_SYSTEM_PROMPT;
  try {
    if (wsRoot) {
      const rules = await loadSteeringRules(wsRoot, "langgraph");
      enrichedSystemPrompt = injectSteering(enrichedSystemPrompt, rules);
      if (rules.length > 0 && streamHandler) {
        const ruleNames = rules.map(r => r.meta.title || r.filePath).join(", ");
        streamHandler.emitDirect({
          type: "chat:toolCall",
          toolCall: {
            id: `steering-${Date.now()}`, name: "steering_rules_loaded",
            args: { count: rules.length, rules: ruleNames.slice(0, 200) },
            status: "completed", result: `${rules.length} steering rules injected`, duration: 0,
          },
        } as any);
      }
    }
  } catch { /* fallback to base prompt */ }

  const verifyNode = createVerifyResponseNode(llmProvider, streamHandler);

  // Create a budget-injecting fetch_tools node that also sets maxContextTokens
  const fetchToolsBase = createFetchToolsNode(toolRegistry);
  const fetchToolsWithBudget = async (state: PipelineState) => {
    const baseResult = await fetchToolsBase(state);
    // Inject context budget into state if provider reports it
    if (contextWindow > 0 && !state.maxContextTokens) {
      return { ...baseResult, maxContextTokens: contextWindow };
    }
    return baseResult;
  };

  // RAG grading config — enabled for small models only
  const ragConfig = getDefaultRagGraderConfig(contextWindow);
  if (ragConfig.enableHallucinationGrade) {
    debugLog(`[chat-graph] Corrective RAG enabled (contextWindow=${contextWindow}): retrieve-eval + hallucination-grader`);
  }

  if (ragConfig.enableHallucinationGrade) {
    // Graph with Corrective RAG nodes for small models
    const graph = new StateGraph(PipelineAnnotation)
      .addNode("fetch_tools", fetchToolsWithBudget)
      .addNode("agent_step", createAgentStepNode(llmProvider, streamHandler, enrichedSystemPrompt))
      .addNode("execute_tools", createExecuteToolsNode(mcpBridge, streamHandler, hookEngine, wsRoot))
      .addNode("verify_response", verifyNode)
      .addNode("synthesize", createSynthesizeNode(llmProvider, streamHandler, enrichedSystemPrompt))
      .addNode("hallucination_grader", createHallucinationGraderNode(llmProvider, streamHandler, ragConfig))
      .addEdge("__start__", "fetch_tools")
      .addEdge("fetch_tools", "agent_step")
      .addConditionalEdges("agent_step", routeAgentStep, { execute_tools: "execute_tools", verify_response: "verify_response" })
      .addConditionalEdges("execute_tools", routeAfterToolExec, { agent_step: "agent_step", synthesize: "synthesize" })
      .addConditionalEdges("verify_response", routeAfterVerify, { execute_tools: "execute_tools", agent_step: "agent_step", __end__: "hallucination_grader" })
      .addConditionalEdges("hallucination_grader", routeAfterHallucinationGrade, { agent_step: "agent_step", __end__: END })
      .addEdge("synthesize", END);

    return graph.compile();
  }

  // Standard graph without RAG grading (large models)
  const graph = new StateGraph(PipelineAnnotation)
    .addNode("fetch_tools", fetchToolsWithBudget)
    .addNode("agent_step", createAgentStepNode(llmProvider, streamHandler, enrichedSystemPrompt))
    .addNode("execute_tools", createExecuteToolsNode(mcpBridge, streamHandler, hookEngine, wsRoot))
    .addNode("verify_response", verifyNode)
    .addNode("synthesize", createSynthesizeNode(llmProvider, streamHandler, enrichedSystemPrompt))
    .addEdge("__start__", "fetch_tools")
    .addEdge("fetch_tools", "agent_step")
    .addConditionalEdges("agent_step", routeAgentStep, { execute_tools: "execute_tools", verify_response: "verify_response" })
    .addConditionalEdges("verify_response", routeAfterVerify, { execute_tools: "execute_tools", agent_step: "agent_step", __end__: END })
    .addConditionalEdges("execute_tools", routeAfterToolExec, { agent_step: "agent_step", synthesize: "synthesize" })
    .addEdge("synthesize", END);

  return graph.compile();
}
