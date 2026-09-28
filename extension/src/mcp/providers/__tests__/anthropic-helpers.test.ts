/**
 * Anthropic provider helper tests — system prompt splitting and tool-message formatting.
 */
import { describe, it, expect } from "vitest";
import { splitMessages, formatMessagesForTools } from "../anthropic-helpers";

describe("splitMessages", () => {
  it("extracts a single system message into the systemPrompt", () => {
    const { systemPrompt, userMessages } = splitMessages([
      { role: "system", content: "Be concise" },
      { role: "user", content: "hi" },
    ]);
    expect(systemPrompt).toBe("Be concise");
    expect(userMessages).toEqual([{ role: "user", content: "hi" }]);
  });

  it("joins multiple system messages with double newlines", () => {
    const { systemPrompt } = splitMessages([
      { role: "system", content: "Rule 1" },
      { role: "system", content: "Rule 2" },
      { role: "user", content: "hi" },
    ]);
    expect(systemPrompt).toBe("Rule 1\n\nRule 2");
  });

  it("returns undefined systemPrompt when no system messages exist", () => {
    const { systemPrompt, userMessages } = splitMessages([
      { role: "user", content: "a" },
      { role: "tool", content: "b", toolCallId: "t" },
    ]);
    expect(systemPrompt).toBeUndefined();
    expect(userMessages).toHaveLength(2);
  });

  it("keeps assistant and tool messages as user messages", () => {
    const { userMessages } = splitMessages([
      { role: "assistant", content: "think" },
      { role: "user", content: "go" },
    ]);
    expect(userMessages.map(m => m.role)).toEqual(["assistant", "user"]);
  });
});

describe("formatMessagesForTools", () => {
  it("converts tool results into user messages with tool_result blocks", () => {
    const formatted = formatMessagesForTools([
      { role: "tool", content: "the answer", toolCallId: "call_1" },
    ]);
    expect(formatted).toEqual([
      { role: "user", content: [{ type: "tool_result", tool_use_id: "call_1", content: "the answer" }] },
    ]);
  });

  it("falls back to 'unknown' tool_use_id when toolCallId is missing", () => {
    const formatted = formatMessagesForTools([{ role: "tool", content: "x" }]);
    expect((formatted[0] as any).content[0].tool_use_id).toBe("unknown");
  });

  it("passes assistant and user messages through unchanged", () => {
    const formatted = formatMessagesForTools([
      { role: "assistant", content: "ok" },
      { role: "user", content: "please" },
    ]);
    expect(formatted).toEqual([
      { role: "assistant", content: "ok" },
      { role: "user", content: "please" },
    ]);
  });

  it("interleaves tool results and ordinary messages in order", () => {
    const formatted = formatMessagesForTools([
      { role: "user", content: "read a.ts" },
      { role: "tool", content: "file contents", toolCallId: "t2" },
      { role: "user", content: "thanks" },
    ]);
    expect((formatted[1] as any).role).toBe("user");
    expect((formatted[1] as any).content).toEqual([{ type: "tool_result", tool_use_id: "t2", content: "file contents" }]);
    expect((formatted[0] as any).content).toBe("read a.ts");
    expect((formatted[2] as any).content).toBe("thanks");
  });
});