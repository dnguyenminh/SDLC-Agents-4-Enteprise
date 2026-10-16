/**
 * SA4E-241 — BackendHttpPoster. Concrete HttpPoster for BulkCheckClient that POSTs
 * JSON to the local Code Intelligence backend. Sends X-Project-Id (identity) so the
 * backend scopes by the authenticated project (SEC-01). Thin adapter (DIP) — no
 * business logic, so BulkCheckClient stays transport-agnostic and unit-testable.
 *
 * SA4E-362 FR-6: tokenProvider accepts either the legacy `() => string` (static
 * token, NO refresh — back-compat with existing callers/tests) or a full
 * `IngestAuthProvider` (401 → refresh → retry EXACTLY once).
 */
import type { HttpPoster } from "./BulkCheckClient";
import type { IngestAuthProvider } from "../../utils/backend-auth-headers";

/** POSTs JSON to `${backendUrl}${path}` and returns the parsed JSON body. */
export class BackendHttpPoster implements HttpPoster {
  /**
   * @param backendUrl - Base URL of the Code Intelligence backend (no trailing slash).
   * @param tokenProvider - Legacy: `() => string` (static token, no refresh). Full:
   *   `IngestAuthProvider` (401 → refresh → retry exactly once — FR-6).
   * @param log - Optional logger (FSD 4.1: log 🔐 401/refresh — never logs the token, BR-6).
   */
  constructor(
    private readonly backendUrl: string,
    private readonly tokenProvider?: (() => string) | IngestAuthProvider,
    private readonly log?: (msg: string) => void,
  ) {}

  /** Discriminate at runtime — a plain function (legacy) has NO refreshToken. */
  private refreshFn(): (() => Promise<string | undefined>) | undefined {
    const tp = this.tokenProvider as (() => string) | IngestAuthProvider | undefined;
    if (!tp || typeof tp === "function") { return undefined; } // legacy — no refresh
    return typeof tp.refreshToken === "function" ? () => tp.refreshToken() : undefined;
  }

  /** Read the sync token from either provider shape (legacy fn or full provider). */
  private syncToken(): string | undefined {
    const tp = this.tokenProvider as (() => string) | IngestAuthProvider | undefined;
    if (!tp) { return undefined; }
    return typeof tp === "function" ? tp() : tp.getTokenSync();
  }

  /** @inheritdoc */
  async postJson(path: string, body: unknown, headers: Record<string, string>): Promise<unknown> {
    const merged: Record<string, string> = { "Content-Type": "application/json", ...headers };
    const token = this.syncToken();
    if (token && !merged["Authorization"]) { merged["Authorization"] = `Bearer ${token}`; }

    const doFetch = (): Promise<Response> => fetch(`${this.backendUrl}${path}`, {
      method: "POST",
      headers: merged,
      body: JSON.stringify(body),
    });
    let res = await doFetch();

    // SA4E-362 FR-6: refresh-on-401 — EXACTLY once, no loop. Refresh undefined or a
    // still-401 retry falls through to the throw below (message unchanged) — the
    // caller (StateComparer/CatalogIndexer) stops per the job's auth-dead state and
    // does NOT re-fetch the catalog (US-2 AC5).
    const refresh = this.refreshFn();
    if (res.status === 401 && refresh) {
      this.log?.(`[Pega Ingester] 🔐 401 received — refreshing token once (endpoint=bulk-check)`);
      const fresh = await refresh();
      if (fresh !== undefined) {
        this.log?.(`[Pega Ingester] 🔐 Token refreshed — retrying once`);
        merged["Authorization"] = `Bearer ${fresh}`; // rebuild ONLY the Authorization header
        res = await doFetch();
      }
    }

    if (!res.ok) {
      // Surface transport/HTTP failures so StateComparer degrades fail-SAFE (E-04).
      throw new Error(`bulk-check HTTP ${res.status} ${res.statusText}`);
    }
    return res.json();
  }
}
