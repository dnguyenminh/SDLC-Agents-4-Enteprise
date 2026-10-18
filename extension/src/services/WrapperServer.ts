/**
 * WrapperServer facade — the implementation was split into the WrapperServer/
 * folder modules (BR-18: ≤200 physical lines per file). This file re-exports
 * EXACTLY the same public symbols as before; importers need no changes.
 */
export {
  DEFAULT_MAX_BODY_SIZE,
  MIN_MCP_MAX_BODY_BYTES,
  MAX_MCP_MAX_BODY_BYTES,
  resolveMcpMaxBodyBytes,
} from "./WrapperServer/constants";
export type { SettingsGetter } from "./WrapperServer/constants";
export { BodyTooLargeError } from "./WrapperServer/body-too-large-error";
export type { WrapperServerDeps } from "./WrapperServer/types";
export { WrapperServer } from "./WrapperServer/wrapper-server";
