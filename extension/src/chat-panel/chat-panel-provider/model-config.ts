/**
 * ChatPanelProvider — LLM model configuration updates.
 * SA4E-389: Updates the active profile's model instead of flat key.
 */

import * as vscode from "vscode";
import { ProviderConfigService } from "../../services/ProviderConfigService";

/** Persist the picked LLM model ("auto" clears the override) via active profile. */
export async function setLlmModelConfig(
  model: string,
  configService?: ProviderConfigService
): Promise<void> {
  // SA4E-389: Use profile-based API if available
  if (configService) {
    const activeProfile = await configService.getActiveProfileRow();
    if (activeProfile) {
      await configService.editProfile(activeProfile.profileId, { model: model === "auto" ? "" : model });
      return;
    }
  }
  // Fallback for backward compatibility
  const config = vscode.workspace.getConfiguration("sdlcAgents");
  try {
    await config.update("llm.model", model === "auto" ? undefined : model, vscode.ConfigurationTarget.Global);
  } catch (err) {
    console.debug("[ChatPanelProvider] handleSetModel config update failed: " + (err as Error).message);
  }
}
