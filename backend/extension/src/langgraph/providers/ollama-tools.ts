/**
 * Ollama tool calling support --- extracted from OllamaProvider.
 */

import type { LlmMessage, LlmOptions, LlmResponse, LlmToolCall } from "../llm-provider";
import type { McpToolDefinition } from "../tool-registry";

export async function ollamaChatWithTools(
  baseUrl: string,
  defaultModel: string,
  messages: LlmMessage[],
  tools: McpToolDefinition[],
  options?: LlmOptions,
  formatMessages?: (msgs: LlmMessage[]) => Array<{ role: string; content: string }>
): Promise<LlmResponse> {
  const model = options?.model || defaultModel;
  const url = `${baseUrl}/api/chat`;
  const ollamaTools = tools.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.inputSchema },
  }));
  const body: Record<string, unknown> = {
    model,
    messages: formatMessages ? formatMessages(messages) : messages.map(m => ({ role: m.role, content: m.content })),
    tools: ollamaTools,
    stream: false,
  };
  if (options?.temperature !== undefined) { body.options = { temperature: options.temperature }; }
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: options?.signal,
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`Ollama API error ${response.status}: ${errorText}`);
  }
  const data = await response.json() as {
    message?: { content?: string; tool_calls?: Array<{ function: { name: string; arguments: Record<string, unknown> } }> };
  };
  const toolCalls = data.message?.tool_calls;
  if (toolCalls && toolCalls.length > 0) {
    const calls: LlmToolCall[] = toolCalls.map((tc, idx) => ({
      id: `ollama-tc-${Date.now()}-${idx}`,
      name: tc.function.name,
      arguments: tc.function.arguments,
    }));
    return { type: "tool_use", toolCalls: calls };
  }
  return { type: "text", text: data.message?.content || "" };
}
