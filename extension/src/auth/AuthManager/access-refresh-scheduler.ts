/**
 * AuthManager — access-token proactive refresh scheduler.
 * Owns the one-shot setTimeout that fires the refresh at 70% of the
 * access token lifetime; the manager supplies live state via deps.
 */

import type { AccessRefreshSchedulerDeps } from "./scheduler-types";

/** Refresh at 70% of the access token lifetime, leaving headroom for retries. */
const ACCESS_REFRESH_FRACTION = 0.7;

export class AccessRefreshScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly deps: AccessRefreshSchedulerDeps) {}

  /** Refresh exactly once at ACCESS_REFRESH_FRACTION of the access token lifetime. */
  schedule(): void {
    this.clear();
    const tokenExpiresAt = this.deps.tokenExpiresAt();
    const tokenAcquiredAt = this.deps.tokenAcquiredAt();
    if (!this.deps.isAuthenticated() || !tokenExpiresAt || !tokenAcquiredAt) return;
    const lifetime = tokenExpiresAt - tokenAcquiredAt;
    if (lifetime <= 0) return;
    const dueAt = tokenAcquiredAt + lifetime * ACCESS_REFRESH_FRACTION;
    const delay = Math.max(1_000, dueAt - Date.now());
    this.timer = setTimeout(() => {
      this.timer = null;
      this.deps.onDue();
    }, delay);
  }

  clear(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
