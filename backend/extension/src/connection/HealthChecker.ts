/**
 * HealthChecker — Periodic /health endpoint polling.
 * Fires onHealthFail event when backend becomes unreachable.
 */

import { HttpClient } from "../proxy/HttpClient";

export class HealthChecker {
  private timer: ReturnType<typeof setInterval> | null = null;
  private failListeners: Array<() => void> = [];

  constructor(
    private readonly httpClient: HttpClient,
    public interval: number = 30000
  ) {}

  onHealthFail(listener: () => void): void {
    this.failListeners.push(listener);
  }

  start(): void {
    this.stop();
    this.timer = setInterval(() => this.check(), this.interval);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async checkOnce(): Promise<boolean> {
    return this.httpClient.healthCheck();
  }

  private async check(): Promise<void> {
    const healthy = await this.httpClient.healthCheck();
    if (!healthy) {
      for (const listener of this.failListeners) {
        listener();
      }
    }
  }
}
