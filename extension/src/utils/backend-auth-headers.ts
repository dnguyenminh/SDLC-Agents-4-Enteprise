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
 * SA4E-362 FR-1 — Auth contract cho ingest path (KB backend /api/v1/pega/*).
 * Đặt cạnh ITokenProvider vì cùng domain auth-header; consumer đã import từ module này
 * (import direction services/* → utils/ giữ nguyên, không tạo cycle).
 */
export interface IngestAuthProvider {
  /** Token hiện tại từ cache (có thể rỗng ""). Dùng cho lần gửi đầu. */
  getTokenSync(): string;
  /**
   * Refresh access token một lần (rotate qua refresh_token).
   * KHÔNG throw — refresh thất bại / phiên chết trả undefined (tín hiệu chuẩn hoá).
   * Dedupe song song do AuthManager.refreshInFlight đảm nhận phía adapter.
   */
  refreshToken(): Promise<string | undefined>;
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
  const token = authManager?.getTokenSync() ?? (globalThis as any).__authTokenProvider?.();
  if (token) { headers["Authorization"] = `Bearer ${token}`; }
  const projectId = getProjectId();
  if (projectId) { headers["X-Project-Id"] = projectId; }
  return headers;
}

/**
 * SA4E-362 FR-2 — Gửi một request; nếu HTTP 401 và có provider → refresh ĐÚNG MỘT lần
 * rồi retry ĐÚNG MỘT lần. Chỉ status 401 trigger refresh (BR-1); network error /
 * non-401 propagate nguyên trạng. Refresh undefined → trả 401 gốc, KHÔNG retry (BR-2/BR-3).
 *
 * @param send — nhận token (có thể undefined khi không có provider) và trả Response.
 *   send PHẢI tự dựng lại headers + body với token mới ở lần gọi thứ 2.
 * @param log — optional logger (không bao giờ log giá trị token — BR-6).
 */
export async function withAuthRetry(
  send: (token: string | undefined) => Promise<Response>,
  auth?: IngestAuthProvider,
  log?: (msg: string) => void,
  endpoint = "",
): Promise<Response> {
  // Lần đầu: token cached (snapshot; rỗng → không Authorization — BR-5)
  const res = await send(auth?.getTokenSync());

  // CHỈ 401 mới refresh. Network error/timeout không bao giờ tới được điểm này
  // (exception propagate ở send) — mid-upload disconnect không retry (BR-1).
  if (res.status !== 401 || !auth) { return res; }

  log?.(`[Pega Ingester] 🔐 401 received — refreshing token once (endpoint=${endpoint})`);

  // Refresh ĐÚNG MỘT lần (dedupe song song bởi AuthManager.refreshInFlight).
  const fresh = await auth.refreshToken();
  if (fresh === undefined) { return res; } // phiên chết → 401 gốc cho caller (throw IngestAuthError tại call site)

  log?.(`[Pega Ingester] 🔐 Token refreshed — retrying once`);
  return send(fresh); // retry ĐÚNG MỘT lần — kể cả 401 lần 2 cũng trả thẳng, KHÔNG refresh lần hai
}
