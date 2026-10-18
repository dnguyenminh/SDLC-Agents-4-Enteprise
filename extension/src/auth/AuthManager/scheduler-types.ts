/**
 * AuthManager — live-state accessors the AccessRefreshScheduler reads.
 */

export interface AccessRefreshSchedulerDeps {
  isAuthenticated: () => boolean;
  tokenExpiresAt: () => number | null;
  tokenAcquiredAt: () => number | null;
  /** Fired when the schedule elapses — triggers a token refresh. */
  onDue: () => void;
}
