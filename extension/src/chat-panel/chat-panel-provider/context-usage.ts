/**
 * ChatPanelProvider — initial + saved-state context usage reporting (SA4E-182).
 * Extracted from ChatPanelProvider; behavior, comments and log strings
 * are preserved exactly.
 */

import { debugLog } from "../../debug-logger";
import { PiWorkflowAdapter } from "../../pi-workflow";
import { ChatExtToWebviewMessage } from "../message-protocol";
import { ContextUsageTracker, ContextUsagePayload } from "../context-usage-tracker";
import type { SessionCompactor } from "../../pi-agent/session-compactor";
import type { CountedFlags } from "./counted-flags";

/** Collaborators the context-usage helpers need from ChatPanelProvider. */
export interface ContextUsageDeps {
  /** Returns the engine, creating it on first use (matches provider.getEngine()). */
  getOrCreateEngine: () => PiWorkflowAdapter;
  /** Returns the engine without creating it (matches plain `this.engine` reads). */
  peekEngine: () => PiWorkflowAdapter | null;
  /** SA4E-370 S3: active tab id for per-tab context accounting. */
  getTabId: () => string;
  getTracker: () => ContextUsageTracker;
  getFlags: () => CountedFlags;
  /** SA4E-339: compactor used by the per-turn auto-compaction path. */
  getCompactor: () => SessionCompactor;
  sendToWebview: (msg: ChatExtToWebviewMessage) => void;
}

/** Send the shared tab:contextUpdate message to the webview. */
export function sendContextUpdateMessage(sendToWebview: (msg: ChatExtToWebviewMessage) => void, tabId: string, payload: ContextUsagePayload): void {
  sendToWebview({
    type: "tab:contextUpdate",
    payload: {
      tabId,
      tokenCount: payload.total.tokens,
      maxTokens: payload.maxTokens,
      breakdown: {
        conversation: payload.conversation.percentage,
        mcpTools: payload.mcpTools.percentage,
        steering: payload.steering.percentage,
      },
    },
  } as any);
}

/**
 * SA4E-182: Send initial context usage on panel load.
 * Reads steering files from disk + estimates MCP tool definitions.
 * Syncs maxTokens from the resolved model's real context window (SA4E-369).
 */
export async function sendInitialContextUsage(deps: ContextUsageDeps): Promise<void> {
  const tabId = deps.getTabId();
  try {
    await detectInitialContextWindow(deps);
    countInitialSteeringTokens(deps, tabId);

    // 2. Count MCP + VS Code tool definitions via engine's McpBridge
    await countMcpToolTokens(deps, tabId);

    // 3. Send to webview
    const payload = deps.getTracker().getUsagePayload(tabId);
    console.log(`[ChatPanel] sendInitialContextUsage: steeringCounted=${deps.getFlags().steeringCounted}, total=${payload.total.tokens}, steering=${payload.steering.tokens}`);
    sendContextUpdateMessage(deps.sendToWebview, tabId, payload);
  } catch (err) {
    debugLog(`[ChatPanel] sendInitialContextUsage error: ${(err as Error).message}`);
  }
}

/**
 * SA4E-182: Eagerly detect context window from provider's /v1/models endpoint.
 * This is the single source of truth for local servers (llama-server -c flag).
 * Static model map is unreliable because user controls context size via CLI args.
 */
/**
 * SA4E-369 context-window bug fix: resolve the maxTokens denominator from the
 * RESOLVED model's real context window FIRST (getModelContextWindow — the
 * runtime pi-ai model registry value). The probe (getDetectedContextWindow,
 * meta.n_ctx) is unreliable — undefined until a probe runs, and 0 while the
 * gateway is offline — which previously forced a hardcoded 128000 fallback and
 * made every budget-gate % wrong for a smaller model (e.g. 65536 → 4% = 2621,
 * not 5120).
 *
 * Resolution chain (the hardcoded 128000 default is never used as a source):
 *   1) getModelContextWindow()  — resolved model's real context window (authoritative)
 *   2) getDetectedContextWindow() — probe meta.n_ctx (fallback for providers that
 *                                   don't expose a context window in their registry)
 *   3) undefined                 — provider fully unreachable (keeps tracker default)
 */
export function resolveMaxTokensFromEngine(engine: PiWorkflowAdapter): number | undefined {
  // Optional chaining so a bare engine mock (tests) without the method degrades
  // to the probe value instead of throwing (SA4E-369 regression found 2026-11-06).
  const registryWindow = engine.getModelContextWindow?.();
  if (typeof registryWindow === "number" && registryWindow > 0) {
    return Math.floor(registryWindow);
  }
  const probeWindow = engine.getDetectedContextWindow?.();
  return typeof probeWindow === "number" && probeWindow > 0 ? Math.floor(probeWindow) : undefined;
}

export function resolveMaxTokens(deps: ContextUsageDeps): number | undefined {
  return resolveMaxTokensFromEngine(deps.getOrCreateEngine());
}

/**
 * SA4E-369: eager one-time sync on panel open. Prefer the resolved model's real
 * context window; only trigger the probe if the registry has no value yet. Never
 * keeps the hardcoded 128000 default as a source.
 */
export async function detectInitialContextWindow(deps: ContextUsageDeps): Promise<void> {
  const maxTokens = resolveMaxTokens(deps);
  if (maxTokens) {
    deps.getTracker().setMaxTokens(maxTokens);
  }
  // If undefined (registry empty + probe absent) the tracker keeps its constructor
  // default until a later sync (saved-state / after-turn) picks up the registry value.
}

/**
 * 1. Count steering tokens — match actual injectSteering() budget (MAX_STEERING_CHARS=4000)
 * Plus base system prompt + agent instructions overhead
 */
function countInitialSteeringTokens(deps: ContextUsageDeps, tabId: string): void {
  if (!deps.getFlags().steeringCounted) {
    // injectSteering caps at 4000 chars of steering content + system prompt base (~3500 chars)
    const SYSTEM_PROMPT_BASE_CHARS = 3500;
    const MAX_STEERING_CHARS = 4000; // mirrors steering-loader.ts injectSteering budget
    const steeringChars = SYSTEM_PROMPT_BASE_CHARS + MAX_STEERING_CHARS;
    deps.getTracker().updateSteeringTokens(tabId, ["x".repeat(steeringChars)]);
    deps.getFlags().steeringCounted = true;
  }
}

/** 2. Count MCP + VS Code tool definitions via engine's McpBridge (once per session). */
async function countMcpToolTokens(deps: ContextUsageDeps, tabId: string): Promise<void> {
  try {
    const engine = deps.getOrCreateEngine();
    const tools = await engine.listAvailableTools();
    if (tools.length > 0) {
      // Build tool text matching what LLM actually receives (name + description + schema)
      const toolText = tools.map((t: any) =>
        `${t.name}: ${t.description || ""} ${JSON.stringify(t.inputSchema || {})}`
      ).join("\n");
      deps.getTracker().addToolTokens(tabId, toolText);
      debugLog(`[ChatPanel] MCP tools counted: ${tools.length} tools, ~${Math.ceil(toolText.length / 4)} tokens`);
    }
  } catch (err) {
    debugLog(`[ChatPanel] MCP tool counting failed (non-fatal): ${(err as Error).message}`);
  }
}

/**
 * SA4E-182: Update context from saved state (triggered by saveChatState debounce).
 * This is the reliable path — fires every time webview saves state after messages change.
 */
export function updateContextUsageFromSavedState(deps: ContextUsageDeps, state: { tabs: unknown[]; activeTabId: string }): void {
  try {
    const tabId = deps.getTabId();
    const tabs = state.tabs as Array<{ id: string; messages?: Array<{ content?: string; role?: string }> }>;
    const activeTab = tabs.find(t => t.id === state.activeTabId) || tabs[0];
    if (!activeTab?.messages || activeTab.messages.length === 0) return;

    // Count conversation tokens
    deps.getTracker().updateFromMessages(
      tabId,
      activeTab.messages.map(m => ({ content: m.content || "" }))
    );

    finishSavedStateUsage(deps, tabId);
  } catch {
    // Non-fatal
  }
}

/** Sync maxTokens + one-shot steering estimate, then send the tab:contextUpdate. */
function finishSavedStateUsage(deps: ContextUsageDeps, tabId: string): void {
  // SA4E-369: Sync maxTokens from the resolved model's real context window
  syncResolvedWindowIfAny(deps);

  // Tool definitions are counted once by updateContextUsageAfterTurn or sendInitialContextUsage.
  // Don't overwrite mcpTools here — they represent constant tool schema tokens, not message content.

  // Steering (count once) — match injectSteering() budget
  if (!deps.getFlags().steeringCounted) {
    deps.getTracker().updateSteeringTokens(tabId, ["x".repeat(7500)]);
    deps.getFlags().steeringCounted = true;
  }

  // Send update
  const payload = deps.getTracker().getUsagePayload(tabId);
  sendContextUpdateMessage(deps.sendToWebview, tabId, payload);
}

/**
 * SA4E-369: sync maxTokens from the resolved model's real context window when
 * available (fallback: probe meta.n_ctx). Never keeps the hardcoded 128000 default.
 */
export function syncResolvedWindowIfAny(deps: ContextUsageDeps): void {
  const maxTokens = resolveMaxTokens(deps);
  if (maxTokens) {
    deps.getTracker().setMaxTokens(maxTokens);
  }
}
