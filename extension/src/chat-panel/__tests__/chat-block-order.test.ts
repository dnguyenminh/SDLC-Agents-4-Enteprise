// @vitest-environment jsdom
/**
 * SA4E-391 Bug 2 — chronological block ordering in the chat transcript.
 *
 * Regression contract:
 *  - A tool call is a CHRONOLOGICAL boundary. The text streamed before it and
 *    the text streamed after it are two distinct response segments and must
 *    render as two blocks WITH the tool block between them.
 *  - Before the fix the post-tool text kept appending to the pre-tool answer
 *    block, so the transcript read "one big answer + trailing tool blocks" —
 *    the tool block appeared AFTER the response it belongs between.
 *  - A background tab's events must never render into the focused tab.
 */
import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";

const CHAT_DIR = path.resolve(__dirname, "../../../webview-assets/chat");

/** Modules under test + their real load-order dependencies (ChatHtmlBuilder). */
const MODULES = [
  "chat-core.js",
  "chat-tabroute.js",
  "chat-tabs.js",
  "chat-tabs-ui.js",
  "chat-context-usage.js",
  "chat-send.js",
  "chat-messages.js",
  "chat-render.js",
  "chat-render-tool.js",
  "chat-stream.js",
  "chat-tabsync.js",
];

/** Element ids the chat modules look up at load time. */
const ELEMENT_IDS = [
  "chat-messages", "chat-input", "send-btn", "status-indicator", "welcome-state",
  "working-bar", "working-text", "cancel-btn", "follow-btn", "approve-btn",
  "reject-btn", "stop-btn", "ctx-btn", "attach-btn", "model-btn", "model-label",
  "model-dropdown", "context-menu", "autopilot-toggle", "input-context-chips",
  "tab-bar", "tab-add-btn", "context-usage-icon", "context-tooltip",
  "context-full-warning", "full-new-tab", "context-toast", "toast-text",
  "toast-dismiss", "input-attachments", "steering-section", "steering-header",
  "steering-list", "steering-count", "slash-popup", "slash-agents-list",
  "slash-steering-list", "slash-skills-list",
];

type ChatState = {
  tabs: Array<{ id: string; name: string; messages: any[]; live?: any }>;
  activeTabId: string;
  getTab: (id: string) => any;
  routeStreamEvent: (msg: any) => void;
};

function installDom(): void {
  document.body.innerHTML = "";
  for (const id of ELEMENT_IDS) {
    const el = document.createElement("div");
    el.id = id;
    document.body.appendChild(el);
  }
  // The tab bar owns the "+" button (renderTabBar inserts items before it).
  const tabBar = document.getElementById("tab-bar") as HTMLElement;
  const tabAddBtn = document.getElementById("tab-add-btn") as HTMLElement;
  tabBar.appendChild(tabAddBtn);
  const inputWrapper = document.createElement("div");
  inputWrapper.className = "input-wrapper";
  document.body.appendChild(inputWrapper);
}

function loadChatModules(): ChatState {
  const win = window as unknown as Window & {
    acquireVsCodeApi: () => unknown;
    crypto: Crypto & { randomUUID?: () => string };
    eval: (src: string) => unknown;
  };
  win.acquireVsCodeApi = () => ({ postMessage: () => undefined, getState: () => undefined, setState: () => undefined });
  if (!win.crypto.randomUUID) {
    let n = 0;
    win.crypto.randomUUID = () => `uuid-${++n}`;
  }
  for (const file of MODULES) {
    const src = fs.readFileSync(path.join(CHAT_DIR, file), "utf8");
    win.eval(src);
  }
  return (window as unknown as { ChatState: ChatState }).ChatState;
}

/** Let requestAnimationFrame callbacks run (the renderer batches DOM writes). */
function flushFrames(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 60));
}

describe("SA4E-391 Bug 2 — tool block renders BETWEEN the answer segments", () => {
  let S: ChatState;
  let messagesEl: HTMLElement;

  beforeEach(() => {
    installDom();
    S = loadChatModules();
    messagesEl = document.getElementById("chat-messages") as HTMLElement;
  });

  it("splits the answer into pre-tool and post-tool blocks with the tool in between", async () => {
    const tabId = S.activeTabId;

    S.routeStreamEvent({
      type: "chat:streamChunk", streamId: "s1", nodeId: "pi", eventType: "token",
      content: "First, let me get an overview of the workspace:", timestamp: "", originTabId: tabId,
    });
    S.routeStreamEvent({
      type: "chat:toolCall",
      toolCall: { id: "tc-1", name: "get_workspace_info", args: {}, status: "running" },
      originTabId: tabId,
    });
    S.routeStreamEvent({
      type: "chat:streamChunk", streamId: "s1", nodeId: "pi", eventType: "token",
      content: "Here is the summary of the findings.", timestamp: "", originTabId: tabId,
    });
    await flushFrames();

    // DOM order: answer → tool → answer (the tool is NOT after the response).
    const classes = Array.from(messagesEl.children).map((el) => el.className);
    expect(classes).toEqual(["oc-answer", "oc-tool status-running", "oc-answer"]);

    // The pre-tool text stays in the FIRST answer block, the post-tool text in
    // the SECOND one — they are never merged into a single block.
    expect(messagesEl.children[0].textContent).toContain("First, let me get an overview");
    expect(messagesEl.children[0].textContent).not.toContain("Here is the summary");
    expect(messagesEl.children[2].textContent).toContain("Here is the summary");

    // The persisted model mirrors the DOM order.
    const tab = S.getTab(tabId);
    expect(tab.messages.map((m: any) => m.role)).toEqual(["assistant", "tool", "assistant"]);
    expect(tab.messages[0].content).toContain("First, let me get an overview");
    expect(tab.messages[2].content).toContain("Here is the summary");
  });

  it("keeps a thinking block before the tool call and opens a fresh answer after it", async () => {
    const tabId = S.activeTabId;

    S.routeStreamEvent({
      type: "chat:streamChunk", streamId: "s2", nodeId: "pi", eventType: "thinking",
      content: "Let me check the workspace structure.", timestamp: "", originTabId: tabId,
    });
    S.routeStreamEvent({
      type: "chat:toolCall",
      toolCall: { id: "tc-2", name: "grep", args: { pattern: "x" }, status: "running" },
      originTabId: tabId,
    });
    S.routeStreamEvent({
      type: "chat:streamChunk", streamId: "s2", nodeId: "pi", eventType: "token",
      content: "The grep found nothing.", timestamp: "", originTabId: tabId,
    });
    await flushFrames();

    const classes = Array.from(messagesEl.children).map((el) => el.className);
    expect(classes).toEqual(["oc-think", "oc-tool status-running", "oc-answer"]);
  });

  it("routes a BACKGROUND tab's thinking into that tab, never into the focused one", async () => {
    const focusedTabId = S.activeTabId;
    const backgroundTabId = "background-tab";
    S.tabs.push({ id: backgroundTabId, name: "Background", messages: [] });

    S.routeStreamEvent({
      type: "chat:streamChunk", streamId: "s3", nodeId: "pi", eventType: "thinking",
      content: "thinking from the background tab", timestamp: "", originTabId: backgroundTabId,
    });
    await flushFrames();

    // The focused tab's DOM stays untouched.
    expect(messagesEl.children.length).toBe(0);
    expect(S.getTab(focusedTabId).messages.length).toBe(0);

    // The background tab owns the thinking block in its model.
    const bg = S.getTab(backgroundTabId);
    expect(bg.messages.length).toBe(1);
    expect(bg.messages[0].role).toBe("thinking");
    expect(bg.messages[0].text).toContain("thinking from the background tab");
  });
});
