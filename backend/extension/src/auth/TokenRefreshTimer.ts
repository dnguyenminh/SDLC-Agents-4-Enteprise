/**
 * TokenRefreshTimer — Periodically checks token expiry and refreshes.
 * Runs every 5 minutes when authenticated.
 */

import type { AuthManager } from "./AuthManager";

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export class TokenRefreshTimer {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly authManager: AuthManager) {}

  start(): void {
    this.stop();
    this.timer = setInterval(() => this.check(), CHECK_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async check(): Promise<void> {
    if (!this.authManager.isAuthenticated) {
      this.stop();
      return;
    }
    try {
      await this.authManager.refreshToken();
    } catch {
      // Refresh failed — AuthManager handles state transition
    }
  }
}
