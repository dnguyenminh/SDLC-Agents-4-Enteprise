/**
 * ChatPanelProvider — reaction to configuration changes (LLM provider/model,
 * provider base URLs). Extracted from ChatPanelProvider.onConfigChange;
 * behavior is preserved exactly. SA4E-370: listens on BOTH the new dotted
 * keys and the legacy flat keys (reads fall back to legacy, so either side
 * changing must refresh the panel).
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
    e.affectsConfiguration("sdlcAgents.llm.provider") || e.affectsConfiguration("sdlcAgents.llmProvider");
  const modelChanged =
    e.affectsConfiguration("sdlcAgents.llm.model") || e.affectsConfiguration("sdlcAgents.llmModel");
  if (providerChanged || modelChanged) {
    const engine = deps.peekEngine();
    const secrets = deps.getSecrets();
    if (engine && secrets) { engine.setLlmProvider(createLlmProvider(secrets)); }
    void deps.sendModels();
    void deps.sendCombinedStatus();
  }
  const baseUrlChanged = [
    ["llm.anthropic.baseUrl","anthropicBaseUrl"],
    ["llm.openai.baseUrl","openaiBaseUrl"],
    ["llm.ollama.baseUrl","ollamaUrl"],
  ].some(([n, o]) =>
    e.affectsConfiguration(`sdlcAgents.${n}`) || e.affectsConfiguration(`sdlcAgents.${o}`));
  if (baseUrlChanged) {
    void deps.sendCombinedStatus();
  }
}
