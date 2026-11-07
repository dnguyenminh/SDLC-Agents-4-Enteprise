/**
 * Hono HTTP server lifecycle (facade).
 * DIP fix: ToolRouter and McpConfigService can be injected via HttpServerOptions.
 * Production defaults create them internally; tests can inject mocks.
 * Implements: UC-2, UC-7, BR-35, BR-37
 *
 * Implementation submodules (same directory):
 * - HttpRouteRegistrar.ts     — app assembly (middleware, routes, MCP endpoint)
 * - HttpServerDbBootstrap.ts  — startup DB migrations + cleanup scheduling
 */

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import type { Logger } from 'pino';
import type { Server as HttpServerType } from 'http';
import { loadPersistedRateLimitCap } from './middleware/rate-limiter.js';
import { loadPersistedIndexLimit } from './routes/api-index.js';
import {
  stopInterruptDetectionScheduler,
} from '../engine/indexer/startup-interrupt-detector.js';
import { CleanupScheduler } from '../engine/indexer/cleanup-scheduler.js';
import { createConfiguredApp, type HttpServerOptions } from './HttpRouteRegistrar.js';
import { runDbBootstrap } from './HttpServerDbBootstrap.js';

// Preserve the original public type export at this module path.
export type { HttpServerOptions } from './HttpRouteRegistrar.js';

export class HttpServer {
  private app: Hono;
  private server: ReturnType<typeof serve> | null = null;
  private logger: Logger;
  private port: number;
  private host: string;
  private _isRunning = false;
  /** SA4E-101: periodic terminal-record cleanup (started after DB bootstrap). */
  private cleanupScheduler?: CleanupScheduler;

  constructor(private options: HttpServerOptions) {
    this.logger = options.logger;
    this.port = options.port;
    this.host = options.host;
    this.app = createConfiguredApp(options);
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = serve({
        fetch: this.app.fetch,
        port: this.port,
        hostname: '127.0.0.1',
        serverOptions: {
          keepAliveTimeout: 60_000,
          headersTimeout: 65_000,
          requestTimeout: 120_000,
        },
      }, async (info) => {
        try {
          this._isRunning = true;
          const addr = this.server?.address?.();
          this.logger.info({ port: info.port, host: '127.0.0.1', address: addr, listening: this.server?.listening }, 'Backend server started - debug: server listening');
          this.logger.info({ port: info.port, host: '127.0.0.1' }, 'Backend server started');
          loadPersistedRateLimitCap().catch((err) => {
            this.logger.debug({ err }, '[RateLimit] Failed to load persisted cap — using env default');
          });
          loadPersistedIndexLimit().catch((err) => {
            this.logger.debug({ err }, '[IndexLimit] Failed to load persisted cap — using env default');
          });
          this.cleanupScheduler = await runDbBootstrap(this.logger);
          resolve();
        } catch (err) {
          this.logger.error({ err }, 'Error in server startup callback');
          reject(err);
        }
      });

      this.server!.on('error', (err: Error) => {
        this.logger.error({ err }, 'HTTP server error');
        if (!this._isRunning) {
          reject(err);
        }
      });

      this.server!.on('close', () => {
        this.logger.warn('HTTP server closed unexpectedly');
        this._isRunning = false;
      });
    });
  }

  async stop(): Promise<void> {
    if (this.server) {
      stopInterruptDetectionScheduler();
      this.cleanupScheduler?.stop();
      this.server.close();
      this._isRunning = false;
      this.logger.info('Backend server stopped');
    }
  }

  get isRunning(): boolean { return this._isRunning; }
  get honoApp(): Hono { return this.app; }
}