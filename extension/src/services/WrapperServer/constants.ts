/**
 * Maximum accepted HTTP body size (64 MB) — large enough for base64-embedded
 * documents (worst real doc so far: ~1.57 MB, SA4E-363), kept below the
 * backend's 100 MB ingress cap so anything the wrapper accepts, the backend
 * also accepts. Overridable per instance via WrapperServerDeps.maxBodyBytes.
 */
export const DEFAULT_MAX_BODY_SIZE = 64 * 1024 * 1024;

/** Clamp bounds for the optional sdlcAgents.mcp.maxBodyBytes setting: never
 *  below 1 MiB (a cap that small rejects every real request) and never above
 *  the backend's 100 MB ingress cap (never buffer a body the backend rejects). */
export const MIN_MCP_MAX_BODY_BYTES = 1 * 1024 * 1024;
export const MAX_MCP_MAX_BODY_BYTES = 100 * 1024 * 1024;

/** Minimal structural view of a settings getter (keeps resolveMcpMaxBodyBytes
 *  testable without vscode). vscode.WorkspaceConfiguration satisfies it. */
export interface SettingsGetter {
  get<T>(section: string, defaultValue: T): T;
  inspect?<T>(section: string): { globalValue?: T; workspaceValue?: T } | undefined;
}

/** SA4E-370 renamed sdlcAgents.mcpMaxBodyBytes → sdlcAgents.mcp.maxBodyBytes. */
const MAX_BODY_KEY = "mcp.maxBodyBytes";
const MAX_BODY_LEGACY_KEY = "mcpMaxBodyBytes";

/**
 * Read the body-size override with legacy-key fallback (SA4E-370): prefer the
 * new dotted key when explicitly set, else the legacy flat key, else default.
 * Without `inspect` (plain test fakes) degrade to a legacy-key read.
 */
function readMaxBodyBytes(settings: SettingsGetter): number {
  if (typeof settings.inspect !== "function") {
    return settings.get<number>(MAX_BODY_LEGACY_KEY, DEFAULT_MAX_BODY_SIZE);
  }
  const newInspect = settings.inspect<number>(MAX_BODY_KEY);
  if (newInspect?.globalValue !== undefined || newInspect?.workspaceValue !== undefined) {
    return settings.get<number>(MAX_BODY_KEY, DEFAULT_MAX_BODY_SIZE);
  }
  const oldInspect = settings.inspect<number>(MAX_BODY_LEGACY_KEY);
  if (oldInspect?.globalValue !== undefined || oldInspect?.workspaceValue !== undefined) {
    return settings.get<number>(MAX_BODY_LEGACY_KEY, DEFAULT_MAX_BODY_SIZE);
  }
  return DEFAULT_MAX_BODY_SIZE;
}

/**
 * Resolve the optional sdlcAgents.mcp.maxBodyBytes setting (SA4E-363 §4).
 * VS Code does NOT enforce manifest minimum/maximum — a cloned repo could ship
 * a huge workspace setting and enlarge the DoS surface — so validation happens
 * here in code: in-range integers pass through (then clamped into
 * [1 MiB, 100 MiB]); strings, 0, negatives and NaN fall back to the default.
 * Read once at wrapper construction → restart-to-apply.
 */
export function resolveMcpMaxBodyBytes(settings: SettingsGetter): number {
  const raw = readMaxBodyBytes(settings);
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw <= 0) return DEFAULT_MAX_BODY_SIZE;
  return Math.min(Math.max(raw, MIN_MCP_MAX_BODY_BYTES), MAX_MCP_MAX_BODY_BYTES);
}
