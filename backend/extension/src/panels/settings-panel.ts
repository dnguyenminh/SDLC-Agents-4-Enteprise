/**
 * Re-export SettingsPanel from new location for backward compatibility.
 * Original code has been refactored into:
 * - panels/settings/SettingsPanel.ts (panel creation + routing)
 * - panels/settings/SettingsMessageHandler.ts (message handling)
 * - services/LlmTestService.ts (LLM testing logic)
 * - services/ProviderConfigService.ts (config read/write)
 */

export { SettingsPanel } from "./settings/SettingsPanel";
