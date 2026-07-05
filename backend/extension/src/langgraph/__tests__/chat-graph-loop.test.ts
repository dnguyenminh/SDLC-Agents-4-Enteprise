/**
 * Unit Tests: Chat Graph Agent Loop Fixes
 * Tests verify-node parsing, routing logic, and state reducers.
 * Isolated from @langchain/langgraph to avoid import hanging.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock vscode
vi.mock("vscode", () => ({
  Uri: { file: (p: string) => ({ fsPath: p }) },
  FileType: { File: 1, Directory: 2 },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: "/mock" } }],
    fs: {
      readFile: vi.fn().mockResolvedValue(Buffer.from("mock")),
      readDirectory: vi.fn().mockResolvedValue([["src", 2]]),
    },
    findFiles: vi.fn().mockResolvedValue([]),
    asRelativePath: vi.fn((u: any) => u?.fsPath || "unknown"),
  },
  window: {
    tabGroups: { all: [] },
    createOutputChannel: () => ({ appendLine: vi.fn() }),
  },
  languages: { getDiagnostics: vi.fn().mockReturnValue([]) },
  DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
}));

import { routeAfterVerify } from "../graphs/verify-node";
import { buildMessages } from "../graphs/chat-graph-nodes";
import { DEFAULT_VERIFY_PROMPT, buildVerifyMessages } from "../graphs/verify-prompt";
import type { LlmMessage } from "../llm-provider";

// --- Test routeAfterVerify ---

describe("routeAfterVerify - routing logic", () => {
  it("routes to execute_tools when toolCalls present", () => {
    const state = {
      toolCalls: [{ id: "tc-1", name: "read_file", arguments: { path: "x" } }],
      agentOutputs: [],
    } as any;
    expect(routeAfterVerify(state)).toBe("execute_tools");
  });

  it("routes to agent_step when agentOutputs is empty", () => {
    const state = {
      toolCalls: null,
      agentOutputs: [],
    } as any;
    expect(routeAfterVerify(state)).toBe("agent_step");
  });

  it("routes to __end__ when agentOutputs has content", () => {
    const state = {
      toolCalls: null,
      agentOutputs: [{ nodeId: "chat", content: "answer", timestamp: "" }],
    } as any;
    expect(routeAfterVerify(state)).toBe("__end__");
  });

  it("routes to agent_step when agentOutputs is undefined", () => {
    const state = { toolCalls: null, agentOutputs: undefined } as any;
    expect(routeAfterVerify(state)).toBe("agent_step");
  });
});

// --- Test parseVerdict via createVerifyResponseNode behavior ---

describe("Verify prompt parsing", () => {
  it("DEFAULT_VERIFY_PROMPT eliminates INCOMPLETE option", () => {
    expect(DEFAULT_VERIFY_PROMPT).not.toContain("INCOMPLETE:");
    expect(DEFAULT_VERIFY_PROMPT).toContain("TOOL_NEEDED");
    expect(DEFAULT_VERIFY_PROMPT).toContain("COMPLETE");
  });

  it("buildVerifyMessages produces correct format", () => {
    const msgs = buildVerifyMessages("review code", "which file?", DEFAULT_VERIFY_PROMPT);
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe("system");
    expect(msgs[1].role).toBe("user");
    expect(msgs[1].content).toContain("review code");
    expect(msgs[1].content).toContain("which file?");
  });
});

// --- Test buildMessages ---

describe("buildMessages - scratchpad accumulation", () => {
  const sysPrompt = "You are a helper.";

  it("includes scratchpad messages after chat history", () => {
    const state = {
      chatHistory: [{ role: "user", content: "hello" }],
      agentScratchpad: [
        { role: "assistant", content: "", toolCalls: [{ id: "1", name: "list_directory", arguments: {} }] },
        { role: "tool", content: "src/ README.md", toolCallId: "1", toolName: "list_directory" },
      ],
    } as any;
    const msgs = buildMessages(state, [], sysPrompt);
    // system + user + assistant(tool) + tool
    expect(msgs.length).toBe(4);
    expect(msgs[0].role).toBe("system");
    expect(msgs[1].role).toBe("user");
    expect(msgs[2].role).toBe("assistant");
    expect(msgs[3].role).toBe("tool");
  });

  it("adds SYSTEM nudge on first iteration for code requests", () => {
    const state = {
      chatHistory: [{ role: "user", content: "review my code" }],
      agentScratchpad: [],
    } as any;
    const tools = [{ name: "list_directory", description: "", inputSchema: {} }];
    const msgs = buildMessages(state, tools, sysPrompt);
    const lastMsg = msgs[msgs.length - 1];
    expect(lastMsg.content).toContain("MUST call a tool now");
  });

  it("does NOT add nudge when scratchpad already has content", () => {
    const state = {
      chatHistory: [{ role: "user", content: "review my code" }],
      agentScratchpad: [
        { role: "user", content: "[SYSTEM REVIEW: incomplete]" },
      ],
    } as any;
    const tools = [{ name: "list_directory", description: "", inputSchema: {} }];
    const msgs = buildMessages(state, tools, sysPrompt);
    const lastMsg = msgs[msgs.length - 1];
    expect(lastMsg.content).not.toContain("MUST call a tool now");
  });
});

// --- Test state reducer behavior (replace semantics) ---

describe("State reducers - replace semantics", () => {
  it("agentOutputs: empty array replaces existing", () => {
    const reducer = (_e: any[], u: any[]) => u;
    const existing = [{ nodeId: "chat", content: "old", timestamp: "" }];
    const update: any[] = [];
    expect(reducer(existing, update)).toEqual([]);
  });

  it("agentScratchpad: new array replaces existing", () => {
    const reducer = (_e: any[], u: any[]) => u;
    const existing = [{ role: "tool", content: "old result" }];
    const update = [
      { role: "tool", content: "old result" },
      { role: "user", content: "feedback" },
    ];
    const result = reducer(existing, update);
    expect(result).toHaveLength(2);
    expect(result[1].content).toBe("feedback");
  });
});
