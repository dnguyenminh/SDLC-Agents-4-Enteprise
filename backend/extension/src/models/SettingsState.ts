/**
 * State shape sent from extension to the Settings webview.
 */

export interface SettingsState {
  type: "state";
  provider: string;
  model: string;
  ollamaUrl: string;
  baseUrl: string;
  hasAnthropicKey: boolean;
  hasOpenaiKey: boolean;
  backendUrl: string;
  mcpServerPort: number;
  enableMcpServer: boolean;
}
