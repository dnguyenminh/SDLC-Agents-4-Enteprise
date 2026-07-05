/**
 * Chat Graph Node Implementations — extracted from chat-graph.ts
 * Contains fetch_tools, agent_step, execute_tools, and synthesize node logic.
 */

import { PipelineState } from "../state";
import { StreamHandler } from "../stream-handler";
import { McpBridge } from "../mcp-bridge";
import { ToolRegistry } from "../tool-registry";
import type { McpToolDefinition } from "../tool-registry";
import type { LlmProvider, LlmMessage } from "../llm-provider";
import { VSCODE_TOOL_DEFINITIONS, isVscodeTool, executeVscodeTool } from "../vscode-tools";
import { HookEngine } from "../hook-engine";
import { debugLog, debugError } from "../../debug-logger";
import { buildBudgetAwareMessages, estimateMessagesTokens, getDynamicToolResultLimits } from "../context-budget";

const LLM_CALL_TIMEOUT_MS = 300_000;

export function buildMessages(state: PipelineState, tools: McpToolDefinition[], systemPrompt: string): LlmMessage[] {
  const contextBudget = state.maxContextTokens || 0;

  // If no budget set (0), use original unbounded behavior
  if (contextBudget <= 0) {
    return buildMessagesUnbounded(state, tools, systemPrompt);
  }

  // Budget-aware path
  let toolNudge: LlmMessage | undefined;
  if ((!state.agentScratchpad || state.agentScratchpad.length === 0) && tools.length > 0) {
    const lastUser = (state.chatHistory || []).filter(m => m.role === "user").pop();
    if (lastUser && looksLikeCodeRequest(lastUser.content)) {
      toolNudge = {
        role: "user",
        content: "[SYSTEM: You MUST call a tool now. Start with list_directory path=\".\" to see the project structure, then read relevant files. Do NOT respond with text yet.]",
      };
    }
  }

  const result = buildBudgetAwareMessages(
    systemPrompt,
    state.chatHistory || [],
    state.agentScratchpad || [],
    tools,
    contextBudget,
    toolNudge,
  );

  return result.messages;
}

/** Original unbounded buildMessages for providers with large/unknown context windows. */
function buildMessagesUnbounded(state: PipelineState, tools: McpToolDefinition[], systemPrompt: string): LlmMessage[] {
  const messages: LlmMessage[] = [{ role: "system", content: systemPrompt }];
  for (const msg of (state.chatHistory || [])) {
    if (msg.role === "user" || msg.role === "assistant") {
      messages.push({ role: msg.role, content: msg.content });
    }
  }
  for (const m of (state.agentScratchpad || [])) { messages.push(m); }

  // If first iteration (no scratchpad) and tools available, nudge model to use tools
  if ((!state.agentScratchpad || state.agentScratchpad.length === 0) && tools.length > 0) {
    const lastUser = messages.filter(m => m.role === "user").pop();
    if (lastUser && looksLikeCodeRequest(lastUser.content)) {
      messages.push({
        role: "user",
        content: "[SYSTEM: You MUST call a tool now. Start with list_directory path=\".\" to see the project structure, then read relevant files. Do NOT respond with text yet.]",
      });
    }
  }

  return messages;
}

function looksLikeCodeRequest(text: string): boolean {
  const lower = text.toLowerCase();
  const keywords = ["review", "code", "source", "file", "read", "xem", "đọc", "kiểm tra", "check", "analyze", "phân tích"];
  return keywords.some(k => lower.includes(k));
}

export function createFetchToolsNode(toolRegistry: ToolRegistry | null) {
  return async (_state: PipelineState) => {
    let mcpTools: McpToolDefinition[] = [];
    if (toolRegistry) {
      try { mcpTools = await toolRegistry.getTools(); } catch { mcpTools = []; }
    }
    const allTools = [...VSCODE_TOOL_DEFINITIONS, ...mcpTools];
    debugLog(`[graph] fetch_tools: ${allTools.length} total tools`);
    return { parallelResults: { toolsJson: JSON.stringify(allTools) }, lastUpdatedAt: new Date().toISOString() };
  };
}

export function createAgentStepNode(
  llmProvider: LlmProvider | undefined, streamHandler: StreamHandler, enrichedSystemPrompt: string
) {
  return async (state: PipelineState) => {
    if (!llmProvider) {
      return {
        agentOutputs: [{ nodeId: "chat", content: "No LLM configured.", timestamp: new Date().toISOString() }],
        pipelineStatus: "completed" as const, toolCalls: null, lastUpdatedAt: new Date().toISOString(),
      };
    }
    const streamId = state.currentStreamId || `stream-chat-${Date.now()}`;
    let tools: McpToolDefinition[] = [];
    try { tools = JSON.parse(state.parallelResults?.toolsJson || "[]"); } catch { tools = []; }

    if (llmProvider.chatWithTools && tools.length > 0) {
      return await agentStepWithTools(state, llmProvider, streamHandler, streamId, tools.slice(0, 10), enrichedSystemPrompt);
    }
    return await agentStepStreaming(state, llmProvider, streamHandler, streamId, enrichedSystemPrompt, tools);
  };
}

async function agentStepWithTools(
  state: PipelineState, llm: LlmProvider, sh: StreamHandler,
  streamId: string, tools: McpToolDefinition[], sysPrompt: string
) {
  try {
    const messages = buildMessages(state, tools, sysPrompt);

    // Log LLM request
    debugLog(`[LLM-REQ] iteration=${state.agentIterations || 0}, messages=${messages.length}, tools=${tools.length}`);
    for (const m of messages) {
      const preview = m.content.slice(0, 150).replace(/\n/g, " ");
      debugLog(`  [${m.role}] ${preview}${m.content.length > 150 ? "..." : ""}`);
      if ((m as any).toolCalls) { debugLog(`  [assistant.toolCalls] ${JSON.stringify((m as any).toolCalls.map((tc: any) => tc.name))}`); }
    }

    const llmPromise = llm.chatWithTools!(messages, tools, { maxTokens: 8192 });
    const timeoutPromise = new Promise<never>((_, rej) => { const t = setTimeout(() => rej(new Error("LLM timeout")), LLM_CALL_TIMEOUT_MS); if (t.unref) t.unref(); });
    const response = await Promise.race([llmPromise, timeoutPromise]);

    // Log LLM response
    if (response.type === "text") {
      debugLog(`[LLM-RES] type=text, length=${(response.text || "").length}`);
      debugLog(`  preview: ${(response.text || "").slice(0, 200).replace(/\n/g, " ")}`);
      sh.emitStatus("chat", "active", streamId);
      sh.emitToken("chat", response.text || "", streamId);
      sh.emitComplete("chat", 0, streamId);
      // NOTE: Do NOT set working=false here — verify may loop back. Engine handler sets it on graph completion.
      return { agentOutputs: [{ nodeId: "chat", content: response.text || "", timestamp: new Date().toISOString() }], pipelineStatus: "completed" as const, toolCalls: null, lastUpdatedAt: new Date().toISOString() };
    }
    debugLog(`[LLM-RES] type=tool_use, calls=${(response.toolCalls || []).map(tc => `${tc.name}(${JSON.stringify(tc.arguments).slice(0, 50)})`).join(", ")}`);
    const tcJson = JSON.stringify((response.toolCalls || []).map(tc => ({ type: "tool_use", id: tc.id, name: tc.name, input: tc.arguments })));
    return { toolCalls: response.toolCalls || null, parallelResults: { lastToolCallsJson: tcJson }, lastUpdatedAt: new Date().toISOString() };
  } catch (error) {
    const errMsg = (error as Error).message;
    debugLog(`[LLM-ERR] ${errMsg}`);
    sh.emitError("chat", errMsg, streamId);
    // Return a terminal error output so verify_response sees agentOutputs and routes to __end__
    // instead of looping back to agent_step infinitely when LLM server is down.
    const errorContent = `⚠️ LLM Error: ${errMsg}`;
    return {
      agentOutputs: [{ nodeId: "chat", content: errorContent, timestamp: new Date().toISOString() }],
      errors: [{ nodeId: "chat", code: "LLM_ERROR", message: errMsg, timestamp: new Date().toISOString(), recoverable: false }],
      pipelineStatus: "failed" as const,
      toolCalls: null,
      lastUpdatedAt: new Date().toISOString(),
    };
  }
}

async function agentStepStreaming(
  state: PipelineState, llm: LlmProvider, sh: StreamHandler,
  streamId: string, sysPrompt: string, tools: McpToolDefinition[]
) {
  sh.emitStatus("chat", "active", streamId);
  try {
    const messages = buildMessages(state, tools, sysPrompt);
    let full = "";
    for await (const token of llm.chatStream(messages, { maxTokens: 8192 })) { full += token; sh.emitToken("chat", token, streamId); }
    sh.emitComplete("chat", 0, streamId);
    return { agentOutputs: [{ nodeId: "chat", content: full, timestamp: new Date().toISOString() }], pipelineStatus: "completed" as const, toolCalls: null, lastUpdatedAt: new Date().toISOString() };
  } catch (error) {
    const errMsg = (error as Error).message;
    sh.emitError("chat", errMsg, streamId);
    const errorContent = `⚠️ LLM Error: ${errMsg}`;
    return {
      agentOutputs: [{ nodeId: "chat", content: errorContent, timestamp: new Date().toISOString() }],
      errors: [{ nodeId: "chat", code: "LLM_ERROR", message: errMsg, timestamp: new Date().toISOString(), recoverable: false }],
      pipelineStatus: "failed" as const,
      toolCalls: null,
      lastUpdatedAt: new Date().toISOString(),
    };
  }
}

export function createExecuteToolsNode(
  mcpBridge: McpBridge | undefined, sh: StreamHandler, hookEngine: HookEngine | undefined, wsRoot: string
) {
  return async (state: PipelineState) => {
    const streamId = state.currentStreamId || `stream-chat-${Date.now()}`;
    const calls = state.toolCalls || [];
    const results: Array<{ toolCallId: string; name: string; content: string }> = [];
    sh.emitComplete("chat", 0, streamId);

    for (const call of calls) {
      const r = await executeSingleTool(call, mcpBridge, sh, streamId, hookEngine, wsRoot);
      results.push(r);
    }

    const newEntries: LlmMessage[] = [
      { role: "assistant", content: "", toolCalls: calls.map(c => ({ id: c.id, name: c.name, arguments: c.arguments })) } as any,
    ];
    // Dynamic tool result sizing based on context budget
    const contextBudget = state.maxContextTokens || 0;
    const currentUsage = estimateMessagesTokens(state.agentScratchpad || []);
    const { dirLimit, fileLimit } = getDynamicToolResultLimits(contextBudget, currentUsage);

    for (const r of results) {
      let content = r.content;
      const isFileContent = r.name === "read_file";
      const limit = isFileContent ? fileLimit : dirLimit;
      if (content.length > limit) {
        content = content.slice(0, limit) + `\n\n[... truncated at ${limit} chars, ${r.content.length} total ...]`;
      }
      newEntries.push({ role: "tool", content, toolCallId: r.toolCallId, toolName: r.name });
    }

    // Accumulate scratchpad (reducer now replaces, so we must append here)
    const scratchpad: LlmMessage[] = [...(state.agentScratchpad || []), ...newEntries];

    return { toolResults: results, agentScratchpad: scratchpad, toolCalls: null, agentIterations: (state.agentIterations || 0) + 1, currentStreamId: `stream-chat-${Date.now()}`, lastUpdatedAt: new Date().toISOString() };
  };
}

async function executeSingleTool(
  call: { id: string; name: string; arguments: Record<string, unknown> },
  mcpBridge: McpBridge | undefined, sh: StreamHandler, streamId: string,
  hookEngine: HookEngine | undefined, wsRoot: string
): Promise<{ toolCallId: string; name: string; content: string }> {
  const tcId = call.id || `tc-${Date.now()}`;

  if (hookEngine) {
    try {
      const pre = await hookEngine.firePreToolUse(call.name, call.arguments || {}, sh, streamId);
      if (pre.denied) return { toolCallId: call.id, name: call.name, content: `Denied by hook "${pre.hookName}"` };
    } catch (e) { debugError(`preToolUse hook error`, e as Error); }
  }

  sh.emitDirect({ type: "chat:toolCall", toolCall: { id: tcId, name: call.name, args: call.arguments, status: "running" } } as any);
  const start = Date.now();

  try {
    let result: string;
    if (call.name === "stream_write_file" && (!call.arguments?.file_path && !call.arguments?.path)) {
      result = "Error: 'file_path' is required";
    } else if (isVscodeTool(call.name)) {
      result = await executeVscodeTool(call.name, call.arguments, wsRoot);
    } else if (mcpBridge) {
      result = await mcpBridge.callTool(call.name, call.arguments);
    } else {
      result = `Error: Tool '${call.name}' not available`;
    }
    const dur = Date.now() - start;
    sh.emitDirect({ type: "chat:toolCallUpdate", id: tcId, status: "completed", result: result.slice(0, 500), duration: dur } as any);
    if (hookEngine) { try { await hookEngine.firePostToolUse(call.name, call.arguments || {}, result, sh, streamId); } catch {} }
    return { toolCallId: call.id, name: call.name, content: result };
  } catch (error) {
    sh.emitDirect({ type: "chat:toolCallUpdate", id: tcId, status: "failed", result: (error as Error).message, duration: Date.now() - start } as any);
    return { toolCallId: call.id, name: call.name, content: `Error: ${(error as Error).message}` };
  }
}

export function createSynthesizeNode(llm: LlmProvider | undefined, sh: StreamHandler, sysPrompt: string) {
  return async (state: PipelineState) => {
    const streamId = state.currentStreamId || `stream-chat-${Date.now()}`;
    if (!llm) return { pipelineStatus: "completed" as const, lastUpdatedAt: new Date().toISOString() };
    try {
      const messages = buildMessages(state, [], sysPrompt);
      messages.push({ role: "user", content: "Provide your final answer now. Do not call any more tools." });
      sh.emitStatus("chat", "active", streamId);
      let full = "";
      if (llm.chatStream) { for await (const t of llm.chatStream(messages, { maxTokens: 8192 })) { full += t; sh.emitToken("chat", t, streamId); } }
      else if (llm.chatWithTools) { const r = await llm.chatWithTools(messages, [], { maxTokens: 8192 }); full = r.text || ""; sh.emitToken("chat", full, streamId); }
      sh.emitComplete("chat", 0, streamId);
      sh.emitDirect({ type: "chat:workingStatus", working: false });
      return { agentOutputs: [{ nodeId: "chat", content: full, timestamp: new Date().toISOString() }], pipelineStatus: "completed" as const, lastUpdatedAt: new Date().toISOString() };
    } catch (error) {
      sh.emitError("chat", (error as Error).message, streamId);
      sh.emitDirect({ type: "chat:workingStatus", working: false });
      return { pipelineStatus: "failed" as const, lastUpdatedAt: new Date().toISOString() };
    }
  };
}
