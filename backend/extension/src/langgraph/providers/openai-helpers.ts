/**
 * OpenAI provider helpers — message formatting and header construction.
 * Extracted from openai-provider.ts.
 */

export interface LlmMessageBasic { role: string; content: string; toolCallId?: string; }

export function formatMessages(messages: LlmMessageBasic[]): Array<{ role: string; content: string }> {
  return messages.map(m => ({ role: m.role, content: m.content }));
}

export function formatMessagesForTools(messages: LlmMessageBasic[]): any[] {
  return messages.map((msg) => {
    if (msg.role === "tool") {
      return { role: "tool", tool_call_id: msg.toolCallId || "unknown", content: msg.content };
    }
    // Assistant message with tool_calls (from scratchpad)
    if (msg.role === "assistant" && (msg as any).toolCalls) {
      const toolCalls = (msg as any).toolCalls as Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
      return {
        role: "assistant",
        content: null,
        tool_calls: toolCalls.map(tc => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        })),
      };
    }
    return { role: msg.role, content: msg.content };
  });
}

export function buildHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) { headers["Authorization"] = `Bearer ${apiKey}`; }
  return headers;
}
