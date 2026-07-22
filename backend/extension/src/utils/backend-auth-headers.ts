/**
 * backend-auth-headers.ts — Shared utility for building backend auth headers.
 * DRY: Extracted from RemoteBackendClient.buildAuthHeaders() for reuse.
 * SRP: Auth header construction is a standalone concern.
 */
import { getProjectId } from "../extension";

export interface ITokenProvider {
  getTokenSync(): string;
}

/**
 * Build standard backend authentication headers.
 * Includes Bearer token (if auth manager provided) and X-Project-Id header.
 *
 * @param authManager - Optional auth manager instance (or any object with getTokenSync)
 * @returns Record of HTTP headers to include in backend requests
 */
export function buildBackendAuthHeaders(authManager?: ITokenProvider): Record<string, string> {
  const headers: Record<string, string> = {};
  const token = authManager?.getTokenSync();
  if (token) { headers["Authorization"] = `Bearer ${token}`; }
  const projectId = getProjectId();
  if (projectId && projectId !== "default") { headers["X-Project-Id"] = projectId; }
  return headers;
}
