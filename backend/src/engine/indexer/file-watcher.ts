/**
 * File Watcher — chokidar-based file system watcher with debounce.
 * Gracefully degrades if chokidar is not installed.
 */

import pino from 'pino';
import { AppConfig } from '../config.js';
import { detectLanguage } from '../scanner/file-scanner.js';

const logger = pino({ name: 'file-watcher' });

type WatchEvent = 'add' | 'change' | 'unlink';
type WatchCallback = (filePath: string, event: WatchEvent) => void;

export class FileWatcher {
  private config: AppConfig;
  private callback: WatchCallback;
  private watcher: any = null;
  private debounceTimers = new Map<string, NodeJS.Timeout>();

  constructor(config: AppConfig, callback: WatchCallback) {
    this.config = config;
    this.callback = callback;
  }

  /** Start watching the workspace for file changes. */
  start(): void {
    this.initChokidar().catch(err => {
      logger.error({ err }, '[watcher] chokidar not available, file watching disabled:');
    });
  }

  /** Stop the file watcher. */
  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    logger.error('[watcher] Stopped');
  }

  private async initChokidar(): Promise<void> {
    const chokidar = await import('chokidar');
    const ignored = this.config.excludePatterns.map(p => `**/${p}/**`);

    this.watcher = chokidar.watch(this.config.workspace, {
      ignored: [...ignored, /(^|[\/\\])\./],
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
    });

    this.watcher.on('add', (p: string) => this.handleEvent(p, 'add'));
    this.watcher.on('change', (p: string) => this.handleEvent(p, 'change'));
    this.watcher.on('unlink', (p: string) => this.handleEvent(p, 'unlink'));

    logger.error('[watcher] Watching for file changes');
  }

  private handleEvent(filePath: string, event: WatchEvent): void {
    if (event !== 'unlink' && !detectLanguage(filePath)) return;
    this.debounce(filePath, () => this.callback(filePath, event));
  }

  private debounce(key: string, fn: () => void): void {
    const existing = this.debounceTimers.get(key);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.debounceTimers.delete(key);
      fn();
    }, this.config.watchDebounceMs);

    this.debounceTimers.set(key, timer);
  }
}
