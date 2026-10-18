/**
 * Maximum accepted HTTP body size (64 MB) — large enough for base64-embedded
 * documents (worst real doc so far: ~1.57 MB, SA4E-363), kept below the
 * backend's 100 MB ingress cap so anything the wrapper accepts, the backend
 * also accepts. Overridable per instance via WrapperServerDeps.maxBodyBytes.
 */
export const DEFAULT_MAX_BODY_SIZE = 64 * 1024 * 1024;

/** Clamp bounds for the optional sdlcAgents.mcpMaxBodyBytes setting: never
 *  below 1 MiB (a cap that small rejects every real request) and never above
 *  the backend's 100 MB ingress cap (never buffer a body the backend rejects). */
export const MIN_MCP_MAX_BODY_BYTES = 1 * 1024 * 1024;
export const MAX_MCP_MAX_BODY_BYTES = 100 * 1024 * 1024;

/** Minimal structural view of a settings getter (keeps resolveMcpMaxBodyBytes
 *  testable without vscode). vscode.WorkspaceConfiguration satisfies it. */
export interface SettingsGetter {
  get<T>(section: string, defaultValue: T): T;
}

/**
 * Resolve the optional sdlcAgents.mcpMaxBodyBytes setting (SA4E-363 §4).
 * VS Code does NOT enforce manifest minimum/maximum — a cloned repo could ship
 * a huge workspace setting and enlarge the DoS surface — so validation happens
 * here in code: in-range integers pass through (then clamped into
 * [1 MiB, 100 MiB]); strings, 0, negatives and NaN fall back to the default.
 * Read once at wrapper construction → restart-to-apply.
 */
export function resolveMcpMaxBodyBytes(settings: SettingsGetter): number {
  const raw = settings.get<number>("mcpMaxBodyBytes", DEFAULT_MAX_BODY_SIZE);
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw <= 0) return DEFAULT_MAX_BODY_SIZE;
  return Math.min(Math.max(raw, MIN_MCP_MAX_BODY_BYTES), MAX_MCP_MAX_BODY_BYTES);
}
