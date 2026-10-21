/**
 * Legacy engine-path helpers for PiWorkflowAdapter (SA4E-333/334/355):
 * provider configuration, loop-guard budget wiring, tool pool assembly,
 * stream replay, and local-endpoint error enrichment.
 */
import type { ChatExtToWebviewMessage } from '../../chat-panel/message-protocol';
import { createWorkspaceTools } from '../pi-coding-tools.js';
import { hintLocalEndpointError, providerRequiresApiKey, buildCredentialResolver } from '../pi-provider-config-bridge.js';
import { PROVIDER_BASE_URL_KEYS, PROVIDER_BASE_URL_LEGACY_KEYS } from '../../models/LlmProviderConfig';
import { getSettingWithFallback } from '../../config/settings-migration.js';
import { getPiExtensionAgentTools } from '../pi-extension-runtime.js';
// SA4E-364: bridge tools join the legacy tool pool (merge skip-if-exists — BR-06).
import { buildMcpBridgeAgentTools } from '../../pi-agent/extensions/mcp-bridge-extension';
import type { McpBridge } from '../../mcp/mcp-bridge';
import type { StreamHandler } from '../../mcp/stream-handler';
import { debugLog } from '../../debug-logger';
import * as vscode from 'vscode';

/**
 * FIX 4 / FIX A: read the Settings-panel provider config and initialize the
 * engine provider (credential resolver + gateway + ordered fallback models).
 * The engine resolves the default AFTER init + gateway registration (bridge
 * cannot resolve pre-init). Empty baseUrl = default URL.
 */
export async function configureEngineProvider(
  engine: import('../pi-workflow').PiWorkflowEngine,
  secrets: vscode.SecretStorage | undefined
): Promise<{ modelUnresolved: boolean; credentialsPresent: boolean }> {
  // SA4E-370: renamed keys resolved with legacy-key fallback.
  const providerId = getSettingWithFallback<string>('llm.provider', 'llmProvider', 'anthropic') || 'anthropic';

  // FIX 4: read the per-provider base URL the Settings panel writes; empty = default URL
  const baseUrlKey = PROVIDER_BASE_URL_KEYS[providerId];
  const baseUrl = (baseUrlKey
    ? getSettingWithFallback<string>(baseUrlKey, PROVIDER_BASE_URL_LEGACY_KEYS[providerId], '')
    : '') || undefined;

  // FIX A: pass the RAW configuredModelId ("auto"/"") down — the engine resolves
  // the default AFTER init + gateway registration (bridge cannot resolve pre-init).
  // PI-MODEL-FALLBACK: ordered fallback models tried when the primary fails
  // with a transient gateway/upstream error (5xx / timeout / bridge sandbox).
  const fallbackModelIds = getSettingWithFallback<string[]>('llm.fallbackModels', 'llmFallbackModels', []);

  const res = await engine.configureProvider({
    credentialResolver: buildCredentialResolver(secrets),
    providerId,
    configuredModelId: getSettingWithFallback<string>('llm.model', 'llmModel', '') || '',
    baseUrl,
    fallbackModelIds,
  });
  return { modelUnresolved: !!res.modelUnresolved, credentialsPresent: !!res.credentialsPresent };
}

/** Loop guard budget wiring (REPETITION-ONLY by design — see runTurnOnce). */
export function resolveTurnBudget(): { timeoutMs: number; maxSameToolRepeats: number | undefined } {
  // Loop guard budget: REPETITION-ONLY by design (product decision).
  // A turn is NEVER stopped by elapsed time — only when a tool/failure/text
  // signature repeats (result no longer changes). sdlcAgents.backend.chatTimeout
  // defaults to 0 = wall-clock timeout DISABLED; set a positive value to opt
  // back into a wall-clock backstop. maxToolRepeats (default 4) still applies.
  const chatTimeoutRaw = vscode.workspace
    ?.getConfiguration?.('sdlcAgents')
    ?.get?.<number>('backend.chatTimeout', 0);
  const chatTimeoutMs =
    Number.isFinite(chatTimeoutRaw) && (chatTimeoutRaw as number) > 0
      ? (chatTimeoutRaw as number)
      : 0; // 0 = no wall-clock timeout
  const maxRepeatsRaw = vscode.workspace
    ?.getConfiguration?.('sdlcAgents')
    ?.get?.<number>('turn.maxToolRepeats', 4);
  return {
    timeoutMs: chatTimeoutMs,
    maxSameToolRepeats: maxRepeatsRaw,
  };
}

/**
 * SA4E-333/334 legacy path: workspace-aware tools.
 * Builtin + extension tools merge last-wins (AFT hoist); bridge tools join
 * AFTER builtin + ext with skip-if-exists (BR-06, OI-06).
 */
export async function assembleLegacyToolPool(
  workspaceRoot: string,
  mcpBridge: McpBridge,
  onEvent: (msg: ChatExtToWebviewMessage) => void
): Promise<{ tools: import('../types/executor.types.js').ExecuteTurnInput['tools']; byName: Map<string, unknown> }> {
  const builtinTools = await createWorkspaceTools(workspaceRoot);
  let extTools: unknown[] = [];
  try {
    const ext = await getPiExtensionAgentTools(workspaceRoot, (msg) => onEvent(msg));
    extTools = ext.tools as unknown[];
    if (ext.loaded.length > 0) {
      debugLog(`[PiWorkflowAdapter] extensions loaded=${ext.loaded.length} tools=${ext.tools.length} skipped=${ext.skipped.length}`);
    }
  } catch (err) {
    debugLog(`[PiWorkflowAdapter] extension runtime skipped: ${(err as Error).message}`);
  }
  const byName = new Map<string, unknown>();
  for (const t of [...(builtinTools as unknown[]), ...extTools]) {
    const name = (t as { name?: unknown }).name;
    if (typeof name === 'string' && name) byName.set(name, t); // extension wins (AFT hoist)
  }
  // SA4E-364: bridge tools join the pool AFTER builtin + ext; skip-if-exists (BR-06).
  const bridgeTools = buildMcpBridgeAgentTools(mcpBridge);
  for (const t of bridgeTools) {
    const name = (t as { name?: unknown }).name;
    if (typeof name !== 'string' || !name) continue;
    if (byName.has(name)) {
      // KHÔNG đè — khác last-wins vòng builtin/ext phía trên (OI-06).
      debugLog(`[PiWorkflowAdapter] bridge tool skipped (exists): ${name}`);
      continue;
    }
    byName.set(name, t);
  }
  const tools = [...byName.values()] as unknown as import('../types/executor.types.js').ExecuteTurnInput['tools'];
  return { tools, byName };
}

/**
 * Replay engine stream chunks through the stream handler (tokens, thinking,
 * errors) — the legacy path streams after execution completes.
 */
export function replayTurnChunks(
  streamHandler: StreamHandler,
  chunks: ReadonlyArray<{ type: string; content?: string; error?: string }>,
  turnStreamId: string
): void {
  for (const chunk of chunks) {
    if (chunk.type === 'text' && chunk.content) { streamHandler.emitToken('pi', chunk.content, turnStreamId); }
    // SA4E-THINKING: reasoning chunks → ThinkingBlock in the webview.
    else if (chunk.type === 'thinking' && chunk.content) { streamHandler.emitThinking('pi', chunk.content, turnStreamId); }
    else if (chunk.type === 'error' && chunk.error) streamHandler.emitError('pi', chunk.error, turnStreamId);
  }
}

/**
 * SA4E-355 UAT fix #1: enrich raw HTTP errors from LOCAL endpoints with the
 * endpoint checklist (UAT otherwise gets an bare "HTTP 401" with nothing
 * actionable), then emit the chat error. Never breaks error reporting.
 */
export function reportTurnError(
  onEvent: (msg: ChatExtToWebviewMessage) => void,
  error: { code: string; message: string }
): void {
  try {
    // SA4E-370: renamed keys resolved with legacy-key fallback.
    const providerId = getSettingWithFallback<string>('llm.provider', 'llmProvider', 'anthropic') || 'anthropic';
    if (!providerRequiresApiKey(providerId)) {
      const baseUrlKey = PROVIDER_BASE_URL_KEYS[providerId];
      const baseUrl = (baseUrlKey
        ? getSettingWithFallback<string>(baseUrlKey, PROVIDER_BASE_URL_LEGACY_KEYS[providerId], '')
        : '') || undefined;
      const modelId = getSettingWithFallback<string>('llm.model', 'llmModel', '') || undefined;
      error.message = hintLocalEndpointError(error.message, providerId, baseUrl, modelId);
    }
  } catch { /* never break error reporting */ }
  onEvent({ type: 'chat:error', code: error.code, message: error.message, retryable: true } as ChatExtToWebviewMessage);
}
