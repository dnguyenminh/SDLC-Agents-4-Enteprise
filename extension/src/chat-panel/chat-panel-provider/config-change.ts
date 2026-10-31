/**
 * ChatPanelProvider — reaction to configuration changes (LLM provider/model,
 * provider base URLs). Extracted from ChatPanelProvider.onConfigChange;
 * behavior is preserved exactly. SA4E-370: listens on new dotted keys only.
 * Legacy flat keys are handled by one-time migration at activation.
 * SA4E-389: Also listens for profile changes (llm.profiles, llm.activeProfileId).
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
  // SA4E-389: Profile-based changes
  const profilesChanged = e.affectsConfiguration("sdlcAgents.llm.profiles");
  const activeProfileChanged = e.affectsConfiguration("sdlcAgents.llm.activeProfileId");
  
  // Backward compat: flat key changes (for users who haven't migrated)
  const providerChanged =
    e.affectsConfiguration("sdlcAgents.llm.provider");
  const modelChanged =
    e.affectsConfiguration("sdlcAgents.llm.model");
  
  if (profilesChanged || activeProfileChanged || providerChanged || modelChanged) {
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
