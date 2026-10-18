/**
 * Local tool execution layer for RemoteBackendClient.
 * Handles tools that execute locally (stream_write_file, embed_image, pega_*).
 *
 * Base64 proxy logic has been extracted to services/Base64ProxyService.ts
 * following SRP — this file only handles local tool execution + definitions.
 *
 * OCP: Tool handlers registered in LOCAL_TOOL_REGISTRY — adding a new local
 * tool does NOT require editing executeLocalTool().
 *
 * SA4E-356: all path handling goes through PathResolver.resolveWorkspacePath
 * (single validation point).
 *
 * BR-18: implementation lives in ./backend-local-tools/* — this file is the
 * stable public façade (same import path and symbols as before the split).
 */
export { STREAM_WRITE_MAX_BYTES } from "./backend-local-tools/constants";
export type { LocalToolDefinition } from "./backend-local-tools/registry";
export {
  registerLocalTool,
  isLocalTool,
  executeLocalTool,
  getLocalToolDefinitions,
  getVisibleLocalToolDefinitions,
} from "./backend-local-tools/registry";
export { checkSymlinkGuard } from "./backend-local-tools/fs-guards";
export { embedMarkdownImages } from "./backend-local-tools/embed-image";
