/**
 * Shared type for backend tool schemas (Base64ProxyService).
 */

/** Describes a single tool's schema from the backend. */
export interface ToolSchema {
  name: string;
  description?: string;
  /** Present on tools/list entries (backend local tools). */
  inputSchema?: Record<string, unknown>;
  /** Present on find_tools catalog entries (dynamic tools). */
  schema?: Record<string, unknown>;
}
