/**
 * Per-provider configuration interfaces for LLM settings.
 */

/** Secret storage keys for each provider */
export const SECRET_KEYS: Record<string, string> = {
  anthropic: "kiroSdlc.anthropicApiKey",
  openai: "kiroSdlc.openaiApiKey",
  openrouter: "kiroSdlc.openaiApiKey",
  lmstudio: "kiroSdlc.openaiApiKey",
  pega: "kiroSdlc.pegaPassword",
  atlassianEmail: "kiroSdlc.atlassian.email",
  atlassianToken: "kiroSdlc.atlassian.apiToken",
  atlassianBaseUrl: "kiroSdlc.atlassian.baseUrl",
};

/** Provider-specific base URL defaults */
export const PROVIDER_BASE_URL_DEFAULTS: Record<string, string> = {
  lmstudio: "http://localhost:1234/v1",
  openrouter: "https://openrouter.ai/api/v1",
  "llm-server": "http://localhost:11434/v1",
};

/** Config keys for per-provider base URLs */
export const PROVIDER_BASE_URL_KEYS: Record<string, string> = {
  anthropic: "anthropicBaseUrl",
  openai: "openaiBaseUrl",
  lmstudio: "lmstudioBaseUrl",
  openrouter: "openrouterBaseUrl",
  "llm-server": "llmServerBaseUrl",
};
