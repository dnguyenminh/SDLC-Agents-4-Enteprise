/**
 * ChatPanelProvider — reaction to configuration changes (LLM provider/model,
 * provider base URLs). Extracted from ChatPanelProvider.onConfigChange;
 * behavior is preserved exactly.
 */

import * as vscode from "vscode";
import type { PiWorkflowAdapter } from "../../pi-workflow";
import { createLlmProvider } from "../../mcp/providers";

/** Collaborators the config-change reaction needs from ChatPanelProvider. */
export interface ChatConfigDeps {
  peekEngine: () => PiWorkflowAdapter | null;
  getSecrets: () => vscode.SecretStorage | undefined;
  sendModels: () => unknown;
  sendCombinedStatus: () => unknown;
}

export function applyChatConfigChange(e: vscode.ConfigurationChangeEvent, deps: ChatConfigDeps): void {
  if (e.affectsConfiguration("sdlcAgents.llmProvider") || e.affectsConfiguration("sdlcAgents.llmModel")) {
    const engine = deps.peekEngine();
    const secrets = deps.getSecrets();
    if (engine && secrets) { engine.setLlmProvider(createLlmProvider(secrets)); }
    void deps.sendModels();
    void deps.sendCombinedStatus();
  }
  if (e.affectsConfiguration("sdlcAgents.anthropicBaseUrl") || e.affectsConfiguration("sdlcAgents.openaiBaseUrl") || e.affectsConfiguration("sdlcAgents.ollamaUrl")) {
    void deps.sendCombinedStatus();
  }
}
