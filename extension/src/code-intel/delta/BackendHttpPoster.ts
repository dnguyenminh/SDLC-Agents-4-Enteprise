/**
 * SA4E-241 — BackendHttpPoster. Concrete HttpPoster for BulkCheckClient that POSTs
 * JSON to the local Code Intelligence backend. Sends X-Project-Id (identity) so the
 * backend scopes by the authenticated project (SEC-01). Thin adapter (DIP) — no
 * business logic, so BulkCheckClient stays transport-agnostic and unit-testable.
 */
import type { HttpPoster } from "./BulkCheckClient";

/** POSTs JSON to `${backendUrl}${path}` and returns the parsed JSON body. */
export class BackendHttpPoster implements HttpPoster {
  /** @param backendUrl - Base URL of the Code Intelligence backend (no trailing slash). */
  constructor(private readonly backendUrl: string) {}

  /** @inheritdoc */
  async postJson(path: string, body: unknown, headers: Record<string, string>): Promise<unknown> {
    const res = await fetch(`${this.backendUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      // Surface transport/HTTP failures so StateComparer degrades fail-SAFE (E-04).
      throw new Error(`bulk-check HTTP ${res.status} ${res.statusText}`);
    }
    return res.json();
  }
}
