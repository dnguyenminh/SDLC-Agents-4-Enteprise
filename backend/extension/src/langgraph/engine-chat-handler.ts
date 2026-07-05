/**
 * Engine Chat Handler — extracted from LangGraphEngine
 * Handles free-form chat invocation with tab history management.
 */

import * as crypto from "crypto";
import { debugLog, debugError } from "../debug-logger";
import { ChatExtToWebviewMessage } from "../chat-panel/message-protocol";
import { StreamHandler } from "./stream-handler";
import { PipelineState, ChatMessage } from "./state";

const CHAT_GRAPH_TIMEOUT_MS = 600_000;

export async function executeChat(
  chatInput: string,
  activeTabId: string,
  chatHistoryByTab: Map<string, ChatMessage[]>,
  graph: { invoke: (state: any, config: any) => Promise<any> },
  streamHandler: StreamHandler,
  onEvent: (msg: ChatExtToWebviewMessage) => void
): Promise<{ activeThread: string }> {
  const threadId = crypto.randomUUID();
  const streamId = `stream-${threadId}-${Date.now()}`;

  const tabHistory = chatHistoryByTab.get(activeTabId) || [];
  tabHistory.push({ id: crypto.randomUUID(), role: "user", content: chatInput, timestamp: new Date().toISOString() } as ChatMessage);
  if (tabHistory.length > 20) tabHistory.splice(0, tabHistory.length - 20);
  chatHistoryByTab.set(activeTabId, tabHistory);

  const initialState: Partial<PipelineState> = {
    ticketKey: "", threadId, currentPhase: "all", intent: "chat",
    pipelineStatus: "running", resumePoint: null, documents: {},
    agentOutputs: [], currentStreamId: streamId,
    approvalRequired: false, approvalDecision: null, userFeedback: null,
    pendingApprovals: [], chatHistory: [...tabHistory], errors: [],
    retryCount: {}, createdAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(), lastCheckpointAt: null,
  };

  try {
    const graphPromise = graph.invoke(initialState, { configurable: { thread_id: threadId }, recursionLimit: 100 });
    const timeoutPromise = new Promise<never>((_, reject) => {
      const t = setTimeout(() => reject(new Error("Chat timed out (10 min).")), CHAT_GRAPH_TIMEOUT_MS);
      if (t.unref) t.unref();
    });
    const result = await Promise.race([graphPromise, timeoutPromise]);

    if (result?.agentOutputs) {
      const last = (result.agentOutputs as Array<{ content: string }>).at(-1);
      if (last?.content) {
        const h = chatHistoryByTab.get(activeTabId) || [];
        h.push({ id: crypto.randomUUID(), role: "assistant", content: last.content, timestamp: new Date().toISOString() } as ChatMessage);
        chatHistoryByTab.set(activeTabId, h);
      }
    } else {
      streamHandler.emitDirect({ type: "chat:streamChunk", streamId, nodeId: "chat", eventType: "token", content: "Reached iteration limit. Try a more specific question.", timestamp: new Date().toISOString() });
      streamHandler.emitDirect({ type: "chat:streamComplete", streamId, nodeId: "chat", finalContent: "" });
    }
  } catch (error) {
    debugError(` invokeChat ERROR: ${(error as Error).message}`);
    onEvent({ type: "chat:error", code: "PIPELINE_ERROR", message: (error as Error).message, retryable: true });
  } finally {
    onEvent({ type: "chat:workingStatus", working: false });
  }
  return { activeThread: threadId };
}
