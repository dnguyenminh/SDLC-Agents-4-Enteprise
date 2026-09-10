/** Indexing Engine — Full scan and incremental indexing. KSA-145. SA4E-53: async. SA4E-78: decoupled. */

import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import { DialectHelper } from '../../database/dialect/DialectHelper.js';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import pino from 'pino';
import { AppConfig } from '../config.js';
import { scanWorkspaceAsync } from './async-file-scanner.js';
import { scanSingleFile, ScannedFile } from './file-scanner.js';
import { TreeSitterIndexer } from '../parsers/tree-sitter-indexer.js';
import { GrammarRegistry, loadGrammarConfig } from '../parsers/grammar-registry.js';
import { GraphRepository } from '../graph/graph-repository.js';
import { runGraphMigrations, isGraphSchemaReady, ensurePostgresSymbolFts } from '../graph/migrator.js';
import { detectSfdxProject, getSfdxStats as getSfdxStatsImpl, logSfdxStats } from './sfdx-helper.js';
import { detectModule, updateModules, detectAndStorePatterns } from './module-helper.js';
import { isFileUnchanged, indexFileSymbolsRegex, upsertFileInDb, upsertFileRegexFallback } from './index-helper.js';
import { DependencyResolver } from '../parsers/dependency-resolver.js';
import { FileWatcher } from './file-watcher.js';
import { IndexScope, resolveScope } from './index-scope.js';
import { GraphSyncService } from '../graph/graph-sync-service.js';
import { GraphRepository as AdminGraphRepository } from '../../database/repositories/GraphRepository.js';
import { getDbAdapter } from '../../admin/db/core.js';
import type { IndexResult } from '../parsers/types.js';
import type { ProgressPhase } from './types.js';
import { CodeEnrichmentTaskCreator } from '../enrichment/CodeEnrichmentTaskCreator.js';
import { ChecksumService } from './checksum-service.js';
import { FileChecksumRepository } from '../../database/repositories/FileChecksumRepository.js';
import * as crypto from 'crypto';


const logger = pino({ name: 'indexing-engine' });
const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
    this.initTreeSitter();
  }

  /**
   * Subscribe to progress events emitted during index operations.
   * @param event - Event name ('progress')
   * @param handler - Callback receiving phase, current, total
   */
  on(event: string, handler: (...args: unknown[]) => void): void {
    this.progressEmitter.on(event, handler);
  }

  private initTreeSitter(): void {
    // SA4E-53: schema check is async — run migrations lazily, non-blocking
    this.ensureGraphSchema().catch(err => {
      logger.error({ err }, '[indexer] Graph schema init failed');
    });
    try {
      this.graphRepo = new GraphRepository(this.adapter);
      const configPath = [path.resolve(__dirname, '../parsers/grammar-config.json'), path.resolve(__dirname, '../../src/parsers/grammar-config.json')].find(fs.existsSync);
      if (configPath) {
        const grammarConfig = loadGrammarConfig(configPath);
        this.grammarRegistry = new GrammarRegistry(grammarConfig);
        this.treeSitterIndexer = new TreeSitterIndexer(this.grammarRegistry, this.adapter, this.config.maxFileSize, this.config.workspace);
        this.treeSitterReady = true;
        logger.error(`[indexer] Tree-sitter initialized (${grammarConfig.languages.length} langs)` + (detectSfdxProject(this.config.workspace) ? ' [SFDX]' : ''));
      } else {
        logger.error(`[indexer] Grammar config not found, using regex fallback`);
      }
    } catch (err) {
      logger.error({ err }, '[indexer] Tree-sitter init failed, using regex fallback:');
      this.treeSitterReady = false;
    }
  }

  /** SA4E-53: Ensure graph schema is ready (async migration). */
  private async ensureGraphSchema(): Promise<void> {
    const ready = await isGraphSchemaReady(this.adapter);
    if (!ready) await runGraphMigrations(this.adapter);
    // Ensure PostgreSQL symbol FTS infrastructure exists even when the graph
    // schema was already provisioned (idempotent; no-op on SQLite).
    await ensurePostgresSymbolFts(this.adapter);
  }

  async startBackgroundIndexing(): Promise<void> {
    // DISABLED: scanWorkspace blocks event loop on Windows with 1000+ files
    return;
  }

  async runFullIndex(scope?: Partial<IndexScope>, signal?: AbortSignal, userId?: string): Promise<void> {
    const { projectId, workspace, displayName } = resolveScope(scope, {
      projectId: this.config.projectId,
      workspace: this.config.workspace,
    });
    if (this.indexing.has(projectId)) return; // per-project guard
    this.indexing.add(projectId);
    logger.error(`[indexer] Starting full index (project=${projectId})...`);
    await new Promise<void>(resolve => setImmediate(resolve));
    try {
      // SA4E-101: Checksum service setup
      let checksumService: ChecksumService | undefined;
      let storedChecksums: Map<string, string> | undefined;
      if (userId) {
        checksumService = new ChecksumService(new FileChecksumRepository());
        storedChecksums = await checksumService.preloadChecksums(userId, projectId).catch(() => new Map());
      }
      // Phase: scanning (SA4E-78: async scan, non-blocking)
      this.emitProgress(projectId, 'scanning', 0, 0);
      const files = await scanWorkspaceAsync({ ...this.config, workspace });
      if (signal?.aborted) { this.emitProgress(projectId, 'cancelled', 0, 0); return; }

      logger.error(`[indexer] Found ${files.length} files to index`);
      // Phase: indexing
      this.emitProgress(projectId, 'indexing', 0, files.length);
      await this.indexFiles(files, projectId, signal, userId, checksumService, storedChecksums);
      if (signal?.aborted) { this.emitProgress(projectId, 'cancelled', 0, 0); return; }

      // Phase: resolving
      this.emitProgress(projectId, 'resolving', 0, 0);
      await new Promise<void>(resolve => setImmediate(resolve));
      await updateModules(this.adapter, projectId);
      await new Promise<void>(resolve => setImmediate(resolve));
      await detectAndStorePatterns(this.adapter, new Map(), logger, projectId);
      if (this.graphRepo) {
        await new Promise<void>(resolve => setImmediate(resolve));
        const resolved = await this.graphRepo.resolveTargets(5000, projectId);
        if (resolved > 0) logger.error(`[indexer] Resolved ${resolved} cross-file symbol references`);
      }
      await new Promise<void>(resolve => setImmediate(resolve));
      await this.syncGraphNodes(projectId);
      await new Promise<void>(resolve => setImmediate(resolve));
      // SA4E-107: Create enrichment tasks (non-blocking — failures don't affect indexing)
      await this.createEnrichmentTasks(projectId);
      await new Promise<void>(resolve => setImmediate(resolve));
      logSfdxStats(this.adapter, this.config, logger);
      this.registerWorkspace(projectId, workspace, displayName);

      this.emitProgress(projectId, 'complete', files.length, files.length, undefined, this.indexSkipped);
      logger.error('[indexer] Full index complete');
    } finally {
      this.indexing.delete(projectId);
    }
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
    return this.syncGraphNodes(projectId);
  }

  /** Project this tenant's code symbols into graph_nodes in index DB (non-fatal). SA4E-53: async. SA4E-78: cached. */
  private async syncGraphNodes(projectId: string): Promise<void> {
    try {
      await this.graphSyncService.syncProjectSymbols(projectId);
    } catch (err) {
      logger.error({ err }, '[indexer] Graph node sync skipped');
    }
  }

  /** SA4E-107: Create enrichment tasks for unenriched symbols (non-fatal, BR-01). */
  private async createEnrichmentTasks(projectId: string): Promise<void> {
    try {
      await this.enrichmentTaskCreator.createTasksForProject(projectId);
    } catch (err) {
      logger.warn({ err }, '[indexer] Enrichment task creation skipped (non-fatal)');
    }
  }

  /** Register workspace in project_registry so admin dropdown shows it (non-fatal). */
  private registerWorkspace(projectId: string, workspace: string, displayName?: string): void {
    try {
      const repo = new AdminGraphRepository(getDbAdapter());
      // Prefer the client's real workspace name (X-Workspace-Root). The `workspace`
      // arg is a synthetic temp scan dir named after projectId, so its basename would
      // wrongly make display_name === project_id. Fall back to it only when no real
      // name was provided (e.g. boot-time indexing of the actual config.workspace).
      const name = displayName || path.basename(workspace);
      repo.registerProject(projectId, name, workspace);
    } catch (err) {
      logger.warn({ err }, '[indexer] project_registry upsert skipped (non-fatal)');
    }
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
    return this.upsertFile(file, pid);
  }

  public getAdapter(): DatabaseAdapter { return this.adapter; }

  removeFile(filePath: string): void {
    const relativePath = filePath.replace(/\\/g, '/');
    const projectId = this.bootProjectId(); // SEC-06: boot-tenant scope only
    // SA4E-53: fire-and-forget async (non-fatal for watcher events)
    this.adapter.runAsync('DELETE FROM files WHERE relative_path = ? AND project_id = ?', [relativePath, projectId])
      .catch(err => logger.error({ err }, '[indexer] removeFile run failed'));
    this.graphRepo?.deleteFileRelationships(relativePath, projectId)
      .catch(err => logger.error({ err }, '[indexer] removeFile deleteFileRelationships failed'));
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
    if (!this.treeSitterReady || !this.grammarRegistry) return { ready: false, languages: [], unavailableGrammars: [] };
    const allLangs = this.grammarRegistry.listLanguages();
    return { ready: true, languages: allLangs.filter(l => l.available).map(l => l.id), unavailableGrammars: allLangs.filter(l => !l.available).map(l => l.id) };
  }

  /** KSA-191: Get SFDX project stats from database. */
  getSfdxStats() { return getSfdxStatsImpl(this.adapter, this.config); }

  /**
   * SA4E-53: replaced prepare() calls with inline runAsync/allAsync.
   * SA4E-78: added signal for cooperative cancellation at batch boundaries.
   * SA4E-101: checksum upsert & cleanup.
   */
  private async indexFiles(files: ScannedFile[], projectId: string, signal?: AbortSignal, userId?: string, checksumService?: ChecksumService, storedChecksums?: Map<string, string>): Promise<void> {
      const { filesToIndex, skippedCount } = await this.registerFilesForIndex(files, projectId, signal, storedChecksums, checksumService);
      this.indexSkipped = skippedCount;
      if (signal?.aborted) return;
    const counts = this.treeSitterReady && this.treeSitterIndexer
      ? await this.indexFileSymbolsTreeSitter(filesToIndex, projectId, signal)
      : await this.indexFileSymbolsRegexFallback(filesToIndex, projectId, signal);
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

  /**
   * Register files into DB and collect those needing symbol indexing.
   * SA4E-53: replaces prepare()+transaction() with runAsync()+transactionAsync().
   * SA4E-78: abort check at batch boundaries.
   */
  private async registerFilesForIndex(files: ScannedFile[], projectId: string, signal?: AbortSignal, storedChecksums?: Map<string, string>, checksumService?: ChecksumService) {
    const filesToIndex: ScannedFile[] = [];
    let skippedCount = 0;
    const BATCH = 200;
    const insertSql = this.adapter.getEngine() === 'sqlite'
      ? `INSERT OR REPLACE INTO files (project_id,path,relative_path,language,module,content_hash,size_bytes,line_count,last_indexed,file_created_at,file_author,file_version) VALUES (?,?,?,?,?,?,?,?,${this.dialect.now()},?,?,?)`
      : `INSERT INTO files (project_id,path,relative_path,language,module,content_hash,size_bytes,line_count,last_indexed,file_created_at,file_author,file_version) VALUES (?,?,?,?,?,?,?,?,${this.dialect.now()},?,?,?) ON CONFLICT (project_id, path) DO UPDATE SET content_hash=EXCLUDED.content_hash, size_bytes=EXCLUDED.size_bytes, line_count=EXCLUDED.line_count, last_indexed=EXCLUDED.last_indexed, file_created_at=EXCLUDED.file_created_at, file_author=EXCLUDED.file_author, file_version=EXCLUDED.file_version`;
    for (let i = 0; i < files.length; i += BATCH) {
      if (signal?.aborted) break; // SA4E-78: cooperative cancellation
      const batch = files.slice(i, i + BATCH);
      await this.adapter.transactionAsync(async () => {
        for (const file of batch) {
          // SA4E-101: checksum-based skip
          if (storedChecksums && checksumService) {
            try {
              const content = fs.readFileSync(file.absolutePath);
              const checksum = checksumService.computeChecksum(content);
              if (storedChecksums.get(file.relativePath) === checksum) {
                skippedCount++;
                continue;
              }
            } catch {
              // fall through to normal check
            }
          }
          if (await isFileUnchanged(this.adapter, file, projectId)) { skippedCount++; continue; }
          filesToIndex.push(file);
          await this.adapter.runAsync(insertSql, [
            projectId, file.absolutePath, file.relativePath, file.language,
            detectModule(file.relativePath), file.contentHash, file.sizeBytes, file.lineCount,
            file.fileCreatedAt ?? null, file.fileAuthor ?? null, file.fileVersion ?? null,
          ]);
        }
      });
      const lastFile = batch[batch.length - 1]?.relativePath || '';
      this.emitProgress(projectId, 'indexing', Math.min(i + BATCH, files.length), files.length, lastFile, skippedCount);
      await new Promise<void>(resolve => setImmediate(resolve));
    }
    return { filesToIndex, skippedCount };
  }

  private async indexFileSymbolsTreeSitter(filesToIndex: ScannedFile[], projectId: string, signal?: AbortSignal) {
    let treeSitterCount = 0;
    let regexCount = 0;
    for (let i = 0; i < filesToIndex.length; i += 50) {
      if (signal?.aborted) break; // SA4E-78: cooperative cancellation
      const batch = filesToIndex.slice(i, i + 50).map(f => ({ absolutePath: f.absolutePath, relativePath: f.relativePath }));
      for (const result of await this.treeSitterIndexer!.indexFiles(batch, projectId)) {
        if (result.method === 'tree-sitter') treeSitterCount++; else regexCount++;
      }
    }
    return { treeSitterCount, regexCount };
  }

  /**
   * SA4E-53: replaced prepare()+transaction() with transactionAsync()+runAsync().
   * SA4E-78: abort check at batch boundaries.
   */
  private async indexFileSymbolsRegexFallback(filesToIndex: ScannedFile[], projectId: string, signal?: AbortSignal) {
    logger.error('[indexer] Tree-sitter not available, using regex extraction');
    let regexCount = 0;
    const BATCH = 25;
    for (let i = 0; i < filesToIndex.length; i += BATCH) {
      if (signal?.aborted) break; // SA4E-78: cooperative cancellation
      const batch = filesToIndex.slice(i, i + BATCH);
      await this.adapter.transactionAsync(async () => {
        for (const file of batch) {
          const fileRow = await this.adapter.getAsync<{ id: number }>(
            'SELECT id FROM files WHERE relative_path = ? AND project_id = ?',
            [file.relativePath, projectId],
          );
          if (!fileRow) continue;
          await this.adapter.runAsync('DELETE FROM symbols WHERE file_id = ?', [fileRow.id]);
          await indexFileSymbolsRegex(file, fileRow.id, projectId, this.adapter, logger);
          regexCount++;
        }
      });
      await new Promise<void>(resolve => setImmediate(resolve));
    }
    return { treeSitterCount: 0, regexCount };
  }

  private async upsertFile(file: ScannedFile, projectId: string): Promise<IndexResult | null> {
    await upsertFileInDb(this.adapter, file, projectId);
    if (this.treeSitterReady && this.treeSitterIndexer) {
      return await this.treeSitterIndexer.indexFile(file.absolutePath, file.relativePath, projectId);
    }
    await upsertFileRegexFallback(this.adapter, file, projectId, logger);
    try {
      const source = fs.readFileSync(file.absolutePath, 'utf-8');
      const depResolver = new DependencyResolver();
      const dependencies = depResolver.resolve(source, file.relativePath, this.config.workspace);
      return {
        filePath: file.relativePath,
        symbolCount: 0,
        relationshipCount: 0,
        parseErrors: 0,
        duration: 0,
        method: 'regex-fallback',
        dependencies,
      };
    } catch {
      return null;
    }
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
