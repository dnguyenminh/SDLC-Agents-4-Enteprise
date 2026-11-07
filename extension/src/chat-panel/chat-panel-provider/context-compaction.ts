/**
 * ChatPanelProvider — per-turn context usage accounting + auto-compaction
 * (SA4E-182 / SA4E-339). Extracted from ChatPanelProvider; behavior,
 * comments and log strings are preserved exactly.
 */

import { debugLog } from "../../debug-logger";
import { PiWorkflowAdapter } from "../../pi-workflow";
import { CompactableSession, SessionMonitor, SessionCompactor, normalizeUsageToFraction, COMPACT_USAGE_THRESHOLD } from "../../pi-agent/session-compactor";
import { ContextUsagePayload } from "../context-usage-tracker";
import type { ContextUsageDeps } from "./context-usage";
import { resolveMaxTokensFromEngine, sendContextUpdateMessage } from "./context-usage";

/**
 * SA4E-182: Update context token usage after each LLM turn completes.
 * Counts conversation messages, estimates steering + tool tokens.
 * Syncs maxTokens from the resolved model's real context window (SA4E-369:
 * registry first, probe meta.n_ctx fallback, 128000 only as last resort).
 * Sends tab:contextUpdate to webview (which chat-tabsync.js handleContextUpdate handles).
 */
export function updateContextUsageAfterTurn(deps: ContextUsageDeps): void {
  try {
    const engine = deps.peekEngine();
    if (!engine) return;
    const tabId = deps.getTabId();
    const detectedWindow = syncTurnWindow(deps, engine);

    const messages = engine.getChatHistory() || [];
    debugLog(`[ChatPanel] updateContextUsageAfterTurn: ${messages.length} messages, maxTokens=${detectedWindow || "default"}`);

    countTurnTokens(deps, engine, messages, tabId);

    // Send tab:contextUpdate with breakdown
    let payload = deps.getTracker().getUsagePayload(tabId);
    payload = compactIfThreshold(deps, tabId, messages, payload);

    debugLog(`[ChatPanel] context payload: total=${payload.total.tokens}, conv=${payload.conversation.tokens}, mcp=${payload.mcpTools.tokens}, steer=${payload.steering.tokens}`);
    sendContextUpdateMessage(deps.sendToWebview, tabId, payload);
  } catch (err) {
    debugLog(`[ChatPanel] updateContextUsageAfterTurn error (non-fatal): ${(err as Error).message}`);
  }
}

/**
 * SA4E-369: Sync maxTokens from the resolved model's real context window.
 * After the first turn, getModelContextWindow() reports the registry value
 * (e.g., 32768 for llama-server -c 65536 -np 2). Falls back to the probe value
 * only if the registry has none — never the hardcoded 128000 default.
 * Uses the engine the caller already resolved (peekEngine) — no second
 * getOrCreateEngine() lookup, so window + counting always come from ONE engine.
 */
function syncTurnWindow(deps: ContextUsageDeps, engine: PiWorkflowAdapter): number | undefined {
  const maxTokens = resolveMaxTokensFromEngine(engine);
  if (maxTokens) {
    deps.getTracker().setMaxTokens(maxTokens);
  }
  return maxTokens;
}

/** Count conversation tokens, one-shot steering estimate and tool definitions. */
function countTurnTokens(deps: ContextUsageDeps, engine: PiWorkflowAdapter, messages: any[], tabId: string): void {
  // Count conversation tokens from messages
  deps.getTracker().updateFromMessages(
    tabId,
    messages.map((m: any) => ({ content: m.content || "" }))
  );

  countTurnSteeringOnce(deps, tabId);

  // SA4E-182: Count MCP tool definitions (schema sent to LLM on every request).
  // These are constant for the session — count once after engine has fetched tools.
  if (!deps.getFlags().toolDefinitionsCounted) {
    void engine.listAvailableTools().then((tools: Array<{ name: string; description?: string; inputSchema?: unknown }>) => {
      if (tools.length > 0) { applyToolDefinitionTokens(deps, tabId, tools); }
    }).catch(() => { /* non-fatal */ });
  }
}

/** Apply tool-definition token estimate (schema sent to LLM on every request). */
function applyToolDefinitionTokens(deps: ContextUsageDeps, tabId: string, tools: Array<{ name: string; description?: string; inputSchema?: unknown }>): void {
  const toolText = tools.map((t: any) =>
    `${t.name}: ${t.description || ""} ${JSON.stringify(t.inputSchema || {})}`
  ).join("\n");
  const usage = (deps.getTracker() as any).tabUsage?.get(tabId);
  if (usage) { usage.mcpTools = Math.ceil(toolText.length / 4); }
  deps.getFlags().toolDefinitionsCounted = true;
  debugLog(`[ChatPanel] Tool definitions counted: ${tools.length} tools, ~${Math.ceil(toolText.length / 4)} tokens`);
}

/** Estimate steering tokens on first call — match injectSteering() actual budget. */
function countTurnSteeringOnce(deps: ContextUsageDeps, tabId: string): void {
  // System prompt base (~3500) + MAX_STEERING_CHARS (4000) = 7500 chars
  if (!deps.getFlags().steeringCounted) {
    deps.getTracker().updateSteeringTokens(tabId, [
      "x".repeat(7500),
    ]);
    deps.getFlags().steeringCounted = true;
  }
}

/** SA4E-339: Auto-trigger compaction when context usage reaches threshold (TDD F-1 refetch). */
function compactIfThreshold(deps: ContextUsageDeps, tabId: string, messages: any[], payload: ContextUsagePayload): ContextUsagePayload {
  const usageFraction = normalizeUsageToFraction(payload.total.percentage);

  // Guard for small-context models: avoid aggressive compaction loops
  // For windows < 16k, raise threshold to 0.97 and require at least 6 messages
  const maxTokens = payload.maxTokens || 0;
  const isSmallContext = maxTokens > 0 && maxTokens < 16384;
  const messageThreshold = isSmallContext ? 6 : 2;
  const compactThreshold = isSmallContext ? 0.97 : COMPACT_USAGE_THRESHOLD; // avoid thrashing

  if (
    usageFraction >= compactThreshold &&
    SessionMonitor.shouldCompact(usageFraction) === 'compact' &&
    messages.length > messageThreshold
  ) {
    debugLog(`[ChatPanel] Triggering auto-compaction: usageFraction=${usageFraction}, maxTokens=${maxTokens}, messages=${messages.length}`);
    applyCompactionAndRecount(deps, tabId, payload.maxTokens, usageFraction, messages);
    // Refetch payload after recount (TDD F-1)
    return deps.getTracker().getUsagePayload(tabId);
  }
  return payload;
}

function applyCompactionAndRecount(deps: ContextUsageDeps, tabId: string, maxTokens: number, usageFraction: number, messages: any[]): void {
  const session = buildCompactableSession(maxTokens, usageFraction, messages);
  const compResult = deps.getCompactor().compact(session);
  if (compResult.action === "compact" && compResult.session.messages.length > 0) {
    if (typeof (deps.peekEngine() as any).setChatHistory === "function") {
      (deps.peekEngine() as any).setChatHistory(compResult.session.messages);
    }
    deps.getTracker().updateFromMessages(
      tabId,
      compResult.session.messages.map((m: any) => ({ content: m.content || "" }))
    );
    debugLog(`[ChatPanel] Auto-compaction complete: tokensSaved=${compResult.tokensSaved}`);
  }
}

function buildCompactableSession(maxTokens: number, usageFraction: number, messages: any[]): CompactableSession {
  return {
    modelId: "default",
    contextWindow: maxTokens,
    usage: usageFraction,
    messages: messages.map((m: any) => ({
      role: m.role || "user",
      content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
      toolName: m.toolName,
    })),
  };
}
