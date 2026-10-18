/**
 * SA4E-85 — KnowledgeClient [v3.1].
 * HTTP client for the Backend Knowledge Service REST API
 * (backend/src/knowledge/routes.ts mounted under /api/v1).
 *
 * Security requirements:
 *  - #19: Bearer JWT (if auth provider available) + X-Project-Id workspace binding
 *  - #18: workspace-scoped thread access is enforced backend-side (404 on mismatch)
 *
 * Backend is the single source of truth; multi-IDE hydrate from here.
 * Timeout + retry are configurable; unreachable backend throws KbUnreachableError
 * (recoverable → STREAM_ERROR(recoverable) at the engine boundary).
 *
 * This file is a facade — implementation lives in ./knowledge-client/*.
 */

export type {
  KbMessageRole,
  KbThreadStatus,
  KbThread,
  KbMessage,
  KbPendingWrite,
  KbCheckpoint,
  KbCreateThreadInput,
  KbSaveCheckpointInput,
  KbMessageInput,
} from "./knowledge-client/models";

export {
  UUID_V4_REGEX,
  isUuidV4,
  parseThreadJson,
  validateThreadJson,
  KbUnreachableError,
} from "./knowledge-client/validation";

export {
  resolveKbBaseUrl,
  type KnowledgeClientOptions,
} from "./knowledge-client/url";

export { KnowledgeClient } from "./knowledge-client/client";
