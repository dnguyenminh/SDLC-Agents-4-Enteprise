/**
 * ReconnectManager — Exponential backoff, transport recreation, tool re-registration.
 * SA4E-37
 */

import type { Logger } from 'pino';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { HealthCheckConfig } from '../types/health.js';
import type { ServerConfig } from '../McpConfigService.js';
import { createTransport } from './TransportFactory.js';

export interface ReconnectCallbacks {
  onReconnectSuccess: (name: string, client: Client) => void;
  onReconnectFailed: (name: string, attempt: number, error: string) => void;
  onMaxRetriesExhausted: (name: string) => void;
}

export class ReconnectManager {
  private pendingTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private logger: Logger;
  private config: HealthCheckConfig;
  private callbacks: ReconnectCallbacks;

  constructor(logger: Logger, config: HealthCheckConfig, callbacks: ReconnectCallbacks) {
    this.logger = logger.child({ component: 'ReconnectManager' });
    this.config = config;
    this.callbacks = callbacks;
  }

  scheduleReconnect(name: string, serverConfig: ServerConfig, attempt: number): string | null {
    if (attempt > this.config.maxRetries) {
      this.callbacks.onMaxRetriesExhausted(name);
      return null;
    }

    const delay = this.calculateDelay(attempt);
    const nextRetryAt = new Date(Date.now() + delay).toISOString();
    this.logger.info({ server: name, attempt, delay, nextRetryAt }, 'Reconnect scheduled');

    const timerId = setTimeout(() => {
      this.pendingTimers.delete(name);
      void this.attemptReconnect(name, serverConfig, attempt);
    }, delay);

    this.pendingTimers.set(name, timerId);
    return nextRetryAt;
  }

  cancelReconnect(name: string): void {
    const timerId = this.pendingTimers.get(name);
    if (timerId) {
      clearTimeout(timerId);
      this.pendingTimers.delete(name);
      this.logger.info({ server: name }, 'Reconnect cancelled');
    }
  }

  updateConfig(config: HealthCheckConfig): void {
    this.config = config;
  }

  calculateDelay(attempt: number): number {
    const baseDelay = Math.min(
      this.config.initialDelay * Math.pow(this.config.backoffMultiplier, attempt - 1),
      this.config.maxDelay,
    );
    if (!this.config.jitterEnabled) return Math.round(baseDelay);
    const jitter = baseDelay * this.config.jitterRange;
    const randomOffset = (Math.random() * 2 - 1) * jitter;
    return Math.round(baseDelay + randomOffset);
  }

  private async attemptReconnect(name: string, serverConfig: ServerConfig, attempt: number): Promise<void> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const transport = createTransport(name, serverConfig) as any;
      const client = new Client({ name: 'code-intel-orchestrator', version: '1.0.0' }, { capabilities: {} });
      await Promise.race([
        client.connect(transport),
        this.createTimeout(10_000),
      ]);
      await client.listTools();
      this.callbacks.onReconnectSuccess(name, client);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn({ server: name, attempt, error: message }, 'Reconnect attempt failed');
      this.callbacks.onReconnectFailed(name, attempt, message);
    }
  }

  private createTimeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Connection timeout after ${ms}ms`)), ms);
    });
  }
}
