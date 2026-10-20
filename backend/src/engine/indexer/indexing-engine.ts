/** Indexing Engine facade (BR-18) — impls in indexer-file-batch / indexer-bootstrap /
 *  indexer-file-upsert / indexer-run-full / indexer-side-effects. */

import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import { DialectHelper } from '../../database/dialect/DialectHelper.js';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import pino from 'pino';
import { AppConfig } from '../config.js';
import { scanSingleFile, ScannedFile } from './file-scanner.js';
import { FileWatcher } from './file-watcher.js';
import { IndexScope } from './index-scope.js';
import { GraphSyncService } from '../graph/graph-sync-service.js';
import { GraphRepository } from '../graph/graph-repository.js';
import { GrammarRegistry } from '../parsers/grammar-registry.js';
import { TreeSitterIndexer } from '../parsers/tree-sitter-indexer.js';
import type { IndexResult } from '../parsers/types.js';
import type { ProgressPhase } from './types.js';
import { CodeEnrichmentTaskCreator } from '../enrichment/CodeEnrichmentTaskCreator.js';
import { ChecksumService } from './checksum-service.js';
import { getSfdxStats as getSfdxStatsImpl } from './sfdx-helper.js';
import {
  registerFilesForIndex, indexFileSymbolsTreeSitter, indexFileSymbolsRegexFallback,
  type FileBatchCtx,
} from './indexer-file-batch.js';
import { initTreeSitter, getTreeSitterStats } from './indexer-bootstrap.js';
import { upsertFile, removeFileRows, type FileUpsertCtx } from './indexer-file-upsert.js';
import { runFullIndex as runFullIndexOrchestrated, type FullIndexCtx } from './indexer-run-full.js';
import { registerWorkspace as registerWorkspaceImpl, runResolvePhases as runResolvePhasesImpl, syncGraphNodes as syncGraphNodesImpl, type SideEffectCtx } from './indexer-side-effects.js';

const logger = pino({ name: 'indexing-engine' });

export class IndexingEngine {
  private adapter: DatabaseAdapter;
  private dialect: DialectHelper;
  private config: AppConfig;
  private watcher: FileWatcher | null = null;
  private running = false;
  private indexing = new Set<string>(); // SA4E-41: per-project index guard
  private treeSitterIndexer: TreeSitterIndexer | null = null;
  private grammarRegistry: GrammarRegistry | null = null;
  private graphRepo: GraphRepository | null = null;
  private treeSitterReady = false;
  /** SA4E-78: Progress event emitter for Observer pattern. */
  private readonly progressEmitter = new EventEmitter();
  /** SA4E-78: Cached instance avoids repeated instantiation (AD-6). */
  private readonly graphSyncService: GraphSyncService;
  /** SA4E-107: Creates enrichment tasks after indexing. */
  private readonly enrichmentTaskCreator: CodeEnrichmentTaskCreator;
  /** SA4E-101: running tally of checksum-skipped files, surfaced via progress events. */
  private indexSkipped = 0;

  constructor(adapter: DatabaseAdapter, config: AppConfig) {
    this.adapter = adapter;
    this.dialect = new DialectHelper(adapter.getEngine());
    this.config = config;
    this.graphSyncService = new GraphSyncService(this.adapter, this.adapter, logger);
    this.enrichmentTaskCreator = new CodeEnrichmentTaskCreator(this.adapter, logger);
    const init = initTreeSitter(this.adapter, this.config, logger);
    this.graphRepo = init.graphRepo;
    this.treeSitterIndexer = init.treeSitterIndexer;
    this.grammarRegistry = init.grammarRegistry;
    this.treeSitterReady = init.treeSitterReady;
  }

  /** Subscribe to progress events ('progress' → handler(phase, current, total)). */
  on(event: string, handler: (...args: unknown[]) => void): void {
    this.progressEmitter.on(event, handler);
  }

  async startBackgroundIndexing(): Promise<void> {
    // DISABLED: scanWorkspace blocks event loop on Windows with 1000+ files
    return;
  }

  async runFullIndex(scope?: Partial<IndexScope>, signal?: AbortSignal, userId?: string): Promise<void> {
    await runFullIndexOrchestrated(this.fullIndexCtx(), scope, signal, userId);
  }

  /** SA4E-78/SA4E-101: Emit progress event via EventEmitter (Observer pattern). */
  private emitProgress(
    projectId: string,
    phase: ProgressPhase,
    current: number,
    total: number,
    currentFile?: string,
    skipped?: number,
  ): void {
    this.progressEmitter.emit('progress', { projectId, phase, current, total, currentFile, skipped });
  }

  /** SA4E-99: Public method for external callers (e.g., api-index route after batch upload). */
  async syncGraphNodesPublic(projectId: string): Promise<void> {
    return syncGraphNodesImpl(this.sideEffectCtx(), projectId);
  }

  /** Register workspace (non-fatal) — MUST be awaited (see indexer-side-effects.ts). */
  public async registerWorkspace(projectId: string, workspace: string, displayName?: string): Promise<void> {
    await registerWorkspaceImpl(this.sideEffectCtx(), projectId, workspace, displayName);
  }

  /**
   * SA4E-41 SEC-06: incremental watcher events are scoped to the BOOT tenant only.
   * The FileWatcher only watches `config.workspace` (a single tenant's tree), so the
   * boot `config.projectId` is the correct owner for these events. Other tenants are
   * indexed push-only via POST /api/index/source (which passes the request projectId
   * to runFullIndex). Do NOT reuse this path for multi-tenant workspaces.
   */
  private bootProjectId(): string {
    return this.config.projectId;
  }

  async indexSingleFile(filePath: string, projectId?: string): Promise<IndexResult | null> {
    const pid = projectId || this.bootProjectId();
    const file = scanSingleFile(filePath, this.config.workspace);
    if (!file) return null;
    return upsertFile(this.upsertCtx(), file, pid);
  }

  public getAdapter(): DatabaseAdapter { return this.adapter; }

  removeFile(filePath: string): void {
    const projectId = this.bootProjectId(); // SEC-06: boot-tenant scope only
    removeFileRows(this.upsertCtx(), this.graphRepo, filePath, projectId);
  }

  isRunning(projectId?: string): boolean {
    return projectId ? this.indexing.has(projectId) : this.indexing.size > 0;
  }
  stop(): void {
    this.running = false;
    this.watcher?.stop();
    this.watcher = null;
  }

  getTreeSitterStats() {
    return getTreeSitterStats(this.grammarRegistry, this.treeSitterReady);
  }

  /** KSA-191: Get SFDX project stats from database. */
  getSfdxStats() {
    return getSfdxStatsImpl(this.adapter, this.config);
  }

  /** SA4E-53/78/101: batch register + symbol indexing + checksum upsert/cleanup. */
  private async indexFiles(files: ScannedFile[], projectId: string, signal?: AbortSignal, userId?: string, checksumService?: ChecksumService, storedChecksums?: Map<string, string>): Promise<void> {
    const { filesToIndex, skippedCount } = await registerFilesForIndex(this.batchCtx(), files, projectId, signal, storedChecksums, checksumService);
    this.indexSkipped = skippedCount;
    if (signal?.aborted) return;
    const counts = this.treeSitterReady && this.treeSitterIndexer
      ? await indexFileSymbolsTreeSitter(this.batchCtx(), filesToIndex, projectId, signal)
      : await indexFileSymbolsRegexFallback(this.batchCtx(), filesToIndex, projectId, signal);
    logger.error(`[indexer] Indexed ${counts.treeSitterCount} files via tree-sitter, ${counts.regexCount} via regex fallback, ${skippedCount} unchanged`);
    // SA4E-101: upsert checksums for processed files and cleanup deleted
    if (userId && checksumService) {
      const currentPaths = files.map(f => f.relativePath);
      // Upsert checksums for files that were indexed
      await Promise.allSettled(filesToIndex.map(async (file) => {
        try {
          const content = fs.readFileSync(file.absolutePath);
          const checksum = checksumService.computeChecksum(content);
          await checksumService.upsert(userId, projectId, file.relativePath, checksum);
        } catch {
          // non-fatal
        }
      }));
      // Cleanup checksums for files no longer present
      await checksumService.cleanupDeleted(userId, projectId, currentPaths).catch(() => undefined);
    }
  }

  // ── Context builders (live state per call) ──
  private fullIndexCtx(): FullIndexCtx {
    return {
      adapter: this.adapter, config: this.config, logger,
      indexing: this.indexing,
      emitProgress: (projectId, phase, current, total, currentFile, skipped) => this.emitProgress(projectId, phase, current, total, currentFile, skipped),
      getIndexSkipped: () => this.indexSkipped,
      indexFiles: (files, projectId, signal, userId, checksumService, storedChecksums) =>
        this.indexFiles(files, projectId, signal, userId, checksumService, storedChecksums),
      registerWorkspace: (projectId, workspace, displayName) => this.registerWorkspace(projectId, workspace, displayName),
      runResolvePhases: (projectId) => this.runResolvePhases(projectId),
    };
  }

  private sideEffectCtx(): SideEffectCtx {
    return {
      adapter: this.adapter, config: this.config, logger,
      graphRepo: this.graphRepo, graphSyncService: this.graphSyncService,
      enrichmentTaskCreator: this.enrichmentTaskCreator,
      emitProgress: (projectId, phase, current, total) =>
        this.emitProgress(projectId, phase, current, total),
    };
  }

  private runResolvePhases(projectId: string): Promise<void> {
    return runResolvePhasesImpl(this.sideEffectCtx(), projectId);
  }

  private batchCtx(): FileBatchCtx {
    return {
      adapter: this.adapter, dialect: this.dialect, config: this.config, logger,
      treeSitterIndexer: this.treeSitterIndexer, treeSitterReady: this.treeSitterReady,
      emitProgress: (projectId, phase, current, total, currentFile, skipped) => this.emitProgress(projectId, phase, current, total, currentFile, skipped),
    };
  }

  private upsertCtx(): FileUpsertCtx {
    return {
      adapter: this.adapter, config: this.config, logger,
      treeSitterIndexer: this.treeSitterIndexer, treeSitterReady: this.treeSitterReady,
    };
  }

  private startWatcher(): void {
    if (!this.config.watchEnabled || !this.running) return;
    this.watcher = new FileWatcher(this.config, (filePath, event) => {
      if (event === 'unlink') this.removeFile(filePath);
      else this.indexSingleFile(filePath).catch(err => logger.error({ err }, `[indexer] Watch error ${filePath}:`));
    });
    this.watcher.start();
  }
}