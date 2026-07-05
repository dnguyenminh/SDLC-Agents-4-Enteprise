/**
 * Anthropic provider helpers — message formatting.
 * Extracted from anthropic-provider.ts.
 */
import type { LlmMessage } from "../llm-provider";

export function splitMessages(messages: LlmMessage[]): { systemPrompt: string | undefined; userMessages: LlmMessage[] } {
  const systemMsgs = messages.filter(m => m.role === "system");
  const userMessages = messages.filter(m => m.role !== "system");
  const systemPrompt = systemMsgs.length > 0 ? systemMsgs.map(m => m.content).join("\n\n") : undefined;
  return { systemPrompt, userMessages };
}

export function formatMessagesForTools(messages: LlmMessage[]): any[] {
  const formatted: any[] = [];
  for (const msg of messages) {
    if (msg.role === "tool") {
      formatted.push({ role: "user", content: [{ type: "tool_result", tool_use_id: msg.toolCallId || "unknown", content: msg.content }] });
    } else if (msg.role === "assistant") {
      formatted.push({ role: "assistant", content: msg.content });
    } else {
      formatted.push({ role: "user", content: msg.content });
    }
  }
  return formatted;
}
