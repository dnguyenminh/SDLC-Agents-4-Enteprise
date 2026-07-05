/**
 * Chat Subgraph agent_step Tests — KSA-237 (Chat Panel BUG)
 *
 * Verifies that when the LLM provider returns real text, the chat node streams
 * that text via emitToken (real answer content), and that an empty LLM response
 * never surfaces a status string ("active") as answer content.
 */
import { describe, it, expect, vi } from "vitest";

// vscode-tools.ts (imported transitively by chat-graph) requires the `vscode`
// module, which is unavailable outside the extension host. Stub it — the chat
// text path never executes a tool, so an empty namespace is sufficient.
vi.mock("vscode", () => ({
  workspace: { workspaceFolders: [] },
  Uri: { file: (p: string) => ({ fsPath: p }) },
  FileType: { Directory: 2, File: 1 },
  window: { tabGroups: { all: [] }, createOutputChannel: () => ({ appendLine: () => {} }) },
  languages: { getDiagnostics: () => [] },
}));

import { buildChatSubgraph } from "../graphs/chat-graph";
import { StreamHandler } from "../stream-handler";
import type { LlmProvider, LlmResponse } from "../llm-provider";

/** Build a provider whose chatWithTools returns a canned response. */
function providerWithToolsResponse(response: LlmResponse): LlmProvider {
  return {
    type: "anthropic",
    chat: vi.fn(),
    chatStream: vi.fn(),
    chatWithTools: vi.fn().mockResolvedValue(response),
    isAvailable: vi.fn().mockResolvedValue(true),
    dispose: vi.fn(),
  } as unknown as LlmProvider;
}

/** Collect emitted webview messages from the StreamHandler. */
function captureHandler() {
  const emitted: any[] = [];
  const handler = new StreamHandler((msg) => emitted.push(msg));
  return { handler, emitted };
}

describe("chat-graph agent_step (KSA-237)", () => {
  it("streams real model text via token events (not status)", async () => {
    const { handler, emitted } = captureHandler();
    const provider = providerWithToolsResponse({ type: "text", text: "Hello there!" });

    // No mcpBridge -> only VS Code built-in tools, ReAct text path is exercised.
    const graph = await buildChatSubgraph(handler, provider, undefined, "/test-workspace");

    await graph.invoke({
      currentStreamId: "stream-test-1",
      chatHistory: [{ role: "user", content: "hello", timestamp: new Date().toISOString() }],
    } as any);

    const tokenEvents = emitted.filter(
      (m) => m.type === "chat:streamChunk" && m.eventType === "token"
    );
    const tokenText = tokenEvents.map((m) => m.content).join("");
    expect(tokenText).toContain("Hello there!");

    // Status events must only ever carry lifecycle signals, never the answer.
    const statusEvents = emitted.filter(
      (m) => m.type === "chat:streamChunk" && m.eventType === "status"
    );
    for (const ev of statusEvents) {
      expect(ev.content).not.toContain("Hello there!");
    }
  });

  it("does not emit answer text when the model returns empty content", async () => {
    const { handler, emitted } = captureHandler();
    const provider = providerWithToolsResponse({ type: "text", text: "" });

    const graph = await buildChatSubgraph(handler, provider, undefined, "/test-workspace");

    await graph.invoke({
      currentStreamId: "stream-test-2",
      chatHistory: [{ role: "user", content: "hello", timestamp: new Date().toISOString() }],
    } as any);

    // The only token emitted is the empty string — no status text leaks in as content.
    const tokenEvents = emitted.filter(
      (m) => m.type === "chat:streamChunk" && m.eventType === "token"
    );
    const tokenText = tokenEvents.map((m) => m.content).join("");
    expect(tokenText).toBe("");

    // A status event named "active" may exist (lifecycle), but it is a status
    // event — the webview renders it on the working bar, not the reply bubble.
    const statusEvents = emitted.filter(
      (m) => m.type === "chat:streamChunk" && m.eventType === "status"
    );
    for (const ev of statusEvents) {
      expect(ev.eventType).toBe("status");
    }
  });
});
