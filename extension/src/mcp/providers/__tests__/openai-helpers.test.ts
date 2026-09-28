/**
 * OpenAI provider helper tests — message formatting, tool_calls shaping, and header construction.
 */
import { describe, it, expect } from "vitest";
import { formatMessages, formatMessagesForTools, buildHeaders } from "../openai-helpers";

describe("formatMessages", () => {
  it("maps messages to role/content pairs", () => {
    expect(formatMessages([{ role: "user", content: "hi" }, { role: "assistant", content: "yo" }])).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "yo" },
    ]);
  });
});

describe("formatMessagesForTools", () => {
  it("shapes tool result messages with tool_call_id", () => {
    const formatted = formatMessagesForTools([{ role: "tool", content: "result", toolCallId: "call_1" }]);
    expect(formatted).toEqual([{ role: "tool", tool_call_id: "call_1", content: "result" }]);
  });

  it("falls back to 'unknown' tool_call_id when missing", () => {
    const formatted = formatMessagesForTools([{ role: "tool", content: "result" }]);
    expect((formatted[0] as any).tool_call_id).toBe("unknown");
  });

  it("shapes assistant scratchpad messages carrying toolCalls", () => {
    const formatted = formatMessagesForTools([
      {
        role: "assistant",
        content: "let me check",
        toolCalls: [
          { id: "c1", name: "read_file", arguments: { path: "a.ts" } },
          { id: "c2", name: "search", arguments: { q: "foo" } },
        ],
      } as any,
    ]);
    expect(formatted[0]).toEqual({
      role: "assistant",
      content: null,
      tool_calls: [
        { id: "c1", type: "function", function: { name: "read_file", arguments: '{"path":"a.ts"}' } },
        { id: "c2", type: "function", function: { name: "search", arguments: '{"q":"foo"}' } },
      ],
    });
  });

  it("passes plain assistant and user messages through unchanged", () => {
    const formatted = formatMessagesForTools([
      { role: "user", content: "go" },
      { role: "assistant", content: "ok" },
    ]);
    expect(formatted).toEqual([
      { role: "user", content: "go" },
      { role: "assistant", content: "ok" },
    ]);
  });
});

describe("buildHeaders", () => {
  it("includes Authorization when an API key is present", () => {
    expect(buildHeaders("secret")).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer secret",
    });
  });

  it("omits Authorization when no API key is present", () => {
    expect(buildHeaders("")).toEqual({ "Content-Type": "application/json" });
  });
});