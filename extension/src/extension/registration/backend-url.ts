/**
 * Runtime backend.url change handling (SA4E-320) — re-points every long-lived
 * backend consumer at the newly-saved URL without an extension reload.
 * Extracted from extension.ts (BR-18 file-size limit).
 */
import * as vscode from "vscode";
import { getBackendUrl, DEFAULT_BACKEND_URL } from "../../config/backend-url";
import { KnowledgeClient } from "../../knowledge-client";
import { runtime } from "./state";
import { getProjectId } from "./project-id";

/** Build KB request headers with the current project scope + bearer token. */
export function buildKbHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "X-Project-Id": getProjectId() };
  const token = runtime.authManager?.getTokenSync();
  if (token) { headers["Authorization"] = `Bearer ${token}`; }
  return headers;
}

/** Watch for `sdlcAgents.backend.url` changes and apply them at runtime. */
export function registerBackendUrlWatcher(
  context: vscode.ExtensionContext,
  outputChannel: vscode.OutputChannel,
): void {
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration("sdlcAgents.backend.url")) { return; }
      applyBackendUrlChange(outputChannel, buildKbHeaders);
    })
  );
}

/**
 * Re-point every long-lived backend consumer at the newly-saved backend.url
 * and reconnect, so a Settings change applies without an extension reload
 * (SA4E-320). Validation failures fall back to the loopback default (fail-safe,
 * same policy as activation). Safe to call repeatedly (updates are no-ops when
 * the URL is unchanged).
 */
function applyBackendUrlChange(
  outputChannel: vscode.OutputChannel,
  buildHeaders: () => Record<string, string>
): void {
  let backendUrl: string;
  try {
    backendUrl = getBackendUrl();
  } catch (err: any) {
    console.warn(`[Security] backend.url validation failed on change: ${err?.message} — falling back to loopback default`);
    backendUrl = DEFAULT_BACKEND_URL;
  }
  outputChannel.appendLine(`[Kiro] backend.url changed → ${backendUrl}. Applying without reload...`);
  runtime.authManager?.updateBaseUrl(backendUrl);
  runtime.sessionManager?.updateClient(new KnowledgeClient(backendUrl, { getHeaders: buildHeaders }));
  // Reconnect the backend client last (async) so it picks up the new URL + token.
  runtime.mcpManager?.updateBackendUrl(backendUrl)
    .then(() => runtime.treeProvider?.refresh())
    .catch((err) => outputChannel.appendLine(`[Kiro] Backend reconnect after URL change failed: ${(err as Error).message}`));
}
