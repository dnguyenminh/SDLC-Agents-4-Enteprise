/**
 * ChatPanelProvider — LLM model configuration updates.
 */

import * as vscode from "vscode";

/** Persist the picked LLM model ("auto" clears the override). */
export async function setLlmModelConfig(model: string): Promise<void> {
  const config = vscode.workspace.getConfiguration("sdlcAgents");
  try {
    await config.update("llm.model", model === "auto" ? undefined : model, vscode.ConfigurationTarget.Global);
  } catch (err) {
    console.debug("[ChatPanelProvider] handleSetModel config update failed: " + (err as Error).message);
  }
}
