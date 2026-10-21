/**
 * Per-provider configuration interfaces for LLM settings.
 */

/** Secret storage keys for each provider */
export const SECRET_KEYS: Record<string, string> = {
  anthropic: "sdlcAgents.anthropicApiKey",
  openai: "sdlcAgents.openaiApiKey",
  openrouter: "sdlcAgents.openaiApiKey",
  lmstudio: "sdlcAgents.openaiApiKey",
  // SA4E-323 OI-4: pega/atlassian* entries below are LEGACY read-only sources
  // (migration + no-folder fallback). DO NOT WRITE — new writes MUST use
  // WorkspaceScopeResolver.secretKey() for per-workspace namespaced keys.
  pega: "kiroSdlc.pegaPassword",
  atlassianEmail: "kiroSdlc.atlassian.email",
  atlassianToken: "kiroSdlc.atlassian.apiToken",
  atlassianBaseUrl: "kiroSdlc.atlassian.baseUrl",
};

/** Provider-specific base URL defaults */
export const PROVIDER_BASE_URL_DEFAULTS: Record<string, string> = {
  lmstudio: "http://localhost:1234/v1",
  openrouter: "https://openrouter.ai/api/v1",
};

/**
 * Config keys for per-provider base URLs.
 * SA4E-370: renamed to dot notation; reads must fall back to the legacy flat
 * keys below (see config/settings-migration.ts).
 */
export const PROVIDER_BASE_URL_KEYS: Record<string, string> = {
  anthropic: "llm.anthropic.baseUrl",
  openai: "llm.openai.baseUrl",
  lmstudio: "llm.lmstudio.baseUrl",
  openrouter: "llm.openrouter.baseUrl",
};

/** SA4E-370 legacy flat base-URL keys — read fallback + write targets. */
export const PROVIDER_BASE_URL_LEGACY_KEYS: Record<string, string> = {
  anthropic: "anthropicBaseUrl",
  openai: "openaiBaseUrl",
  lmstudio: "lmstudioBaseUrl",
  openrouter: "openrouterBaseUrl",
};
