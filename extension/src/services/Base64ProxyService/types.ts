/**
 * Shared type for backend tool schemas (Base64ProxyService).
 */

/** Describes a single tool's schema from the backend. */
export interface ToolSchema {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}
