/**
 * ChatPanelProvider — reaction to configuration changes (LLM provider/model,
 * provider base URLs). Extracted from ChatPanelProvider.onConfigChange;
 * behavior is preserved exactly. SA4E-370: listens on new dotted keys only.
 * Legacy flat keys are handled by one-time migration at activation.
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
  const providerChanged =
    e.affectsConfiguration("sdlcAgents.llm.provider");
  const modelChanged =
    e.affectsConfiguration("sdlcAgents.llm.model");
  if (providerChanged || modelChanged) {
    const engine = deps.peekEngine();
    const secrets = deps.getSecrets();
    if (engine && secrets) { engine.setLlmProvider(createLlmProvider(secrets)); }
    void deps.sendModels();
    void deps.sendCombinedStatus();
  }
  const baseUrlChanged = [
    "llm.anthropic.baseUrl",
    "llm.openai.baseUrl",
    "llm.ollama.baseUrl",
  ].some(n =>
    e.affectsConfiguration(`sdlcAgents.${n}`));
  if (baseUrlChanged) {
    void deps.sendCombinedStatus();
  }
}
