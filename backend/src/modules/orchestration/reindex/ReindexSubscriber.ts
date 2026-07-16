/**
 * SA4E-42 — Observer that subscribes to `onServerStateChange`, maps each event to
 * an action, and enqueues a debounced, per-server re-index task (IR-1/2/7).
 * Owns the Unsubscribe handle; `stop()` releases it (no leaks).
 */
import type { Logger } from 'pino';
import type { ServerStateChangeEvent, Unsubscribe } from '../types/health.js';
import type { IStateChangeSource } from './models/ports.js';
import type { ReindexAction } from './models/ReindexAction.js';
import { ReindexActionMapper } from './ReindexActionMapper.js';
import { PerServerTaskQueue } from './PerServerTaskQueue.js';
import { ReindexService } from './ReindexService.js';

export class ReindexSubscriber {
  private unsubscribe: Unsubscribe | null = null;

  constructor(
    private readonly source: IStateChangeSource,
    private readonly service: ReindexService,
    private readonly queue: PerServerTaskQueue,
    private readonly mapper: ReindexActionMapper,
    private readonly logger: Logger,
    private readonly debounceMs = 250,
  ) {}

  start(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = this.source.onServerStateChange((e) => this.onEvent(e));
    this.logger.info('re-index subscriber started');
  }

  stop(): void {
    if (!this.unsubscribe) return;
    this.unsubscribe();
    this.unsubscribe = null;
    this.logger.info('re-index subscriber stopped');
  }

  onEvent(event: ServerStateChangeEvent): void {
    const action = this.mapper.fromState(event.newState);
    if (action === 'noop') return;
    this.queue.enqueue(event.serverName, () => this.runAction(action, event.serverName), this.debounceMs);
  }

  /** Test/shutdown helper: await the server's queue to drain. */
  async settle(server: string): Promise<void> {
    await this.queue.settle(server);
  }

  private async runAction(action: ReindexAction, server: string): Promise<void> {
    if (action === 'ingest') await this.service.reindexConnected(server);
    else await this.service.reindexRemoved(server);
  }
}
