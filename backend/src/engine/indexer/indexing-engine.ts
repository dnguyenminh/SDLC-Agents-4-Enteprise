/** Indexing Engine — Full scan and incremental indexing. KSA-145. SA4E-53: async refactor. */

import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import { DialectHelper } from '../../database/dialect/DialectHelper.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import pino from 'pino';
import { AppConfig } from '../config.js';
import { scanWorkspace, scanSingleFile, ScannedFile } from '../scanner/file-scanner.js';
import { TreeSitterIndexer } from '../parsers/tree-sitter-indexer.js';
import { GrammarRegistry, loadGrammarConfig } from '../parsers/grammar-registry.js';
import { GraphRepository } from '../database/graph-repository.js';
import { runGraphMigrations, isGraphSchemaReady } from '../database/migrator.js';
import { detectSfdxProject, getSfdxStats as getSfdxStatsImpl, logSfdxStats } from './sfdx-helper.js';
import { detectModule, updateModules, detectAndStorePatterns } from './module-helper.js';
import { isFileUnchanged, indexFileSymbolsRegex, upsertFileInDb, upsertFileRegexFallback } from './index-helper.js';
import { FileWatcher } from './file-watcher.js';
import { IndexScope, resolveScope } from './index-scope.js';
import { GraphSyncService } from '../graph/graph-sync-service.js';
import { GraphRepository as AdminGraphRepository } from '../../database/repositories/GraphRepository.js';
import { getAdminAdapter } from '../../admin/db/core.js';


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

  constructor(adapter: DatabaseAdapter, config: AppConfig) {
    this.adapter = adapter;
    this.dialect = new DialectHelper(adapter.getEngine());
    this.config = config;
    this.initTreeSitter();
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
        this.treeSitterIndexer = new TreeSitterIndexer(this.grammarRegistry, this.adapter, this.config.maxFileSize);
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
  }

  async startBackgroundIndexing(): Promise<void> {
    // DISABLED: scanWorkspace blocks event loop on Windows with 1000+ files
    return;
  }

  async runFullIndex(scope?: Partial<IndexScope>): Promise<void> {
    const { projectId, workspace } = resolveScope(scope, {
      projectId: this.config.projectId,
      workspace: this.config.workspace,
    });
    if (this.indexing.has(projectId)) return; // per-project guard
    this.indexing.add(projectId);
    logger.error(`[indexer] Starting full index (project=${projectId})...`);
    await new Promise<void>(resolve => setImmediate(resolve));
    try {
      const files = scanWorkspace({ ...this.config, workspace });
      logger.error(`[indexer] Found ${files.length} files to index`);
      await this.indexFiles(files, projectId);
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
      logSfdxStats(this.adapter, this.config, logger);
      // Register workspace in project_registry so admin UI can show it in dropdown
      this.registerWorkspace(projectId, workspace);
      logger.error('[indexer] Full index complete');
    } finally {
      this.indexing.delete(projectId);
    }
  }

  /** Project this tenant's code symbols into graph_nodes in index DB (non-fatal). SA4E-53: async. */
  private async syncGraphNodes(projectId: string): Promise<void> {
    try {
      await new GraphSyncService(this.adapter, this.adapter, logger).syncProjectSymbols(projectId);
    } catch (err) {
      logger.error({ err }, '[indexer] Graph node sync skipped');
    }
  }

  /** Register workspace in project_registry so admin dropdown shows it (non-fatal). */
  private registerWorkspace(projectId: string, workspace: string): void {
    try {
      const repo = new AdminGraphRepository(getAdminAdapter());
      repo.registerProject(projectId, path.basename(workspace), workspace);
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

  async indexSingleFile(filePath: string): Promise<void> {
    const projectId = this.bootProjectId(); // SEC-06: boot-tenant scope only
    const file = scanSingleFile(filePath, this.config.workspace);
    // SA4E-53: isFileUnchanged is now async
    if (!file || await isFileUnchanged(this.adapter, file, projectId)) return;
    await this.upsertFile(file, projectId);
  }

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
   * Uses transactionAsync batches for PostgreSQL compatibility.
   */
  private async indexFiles(files: ScannedFile[], projectId: string): Promise<void> {
    const { filesToIndex, skippedCount } = await this.registerFilesForIndex(files, projectId);
    const counts = this.treeSitterReady && this.treeSitterIndexer
      ? await this.indexFileSymbolsTreeSitter(filesToIndex, projectId)
      : await this.indexFileSymbolsRegexFallback(filesToIndex, projectId);
    logger.error(`[indexer] Indexed ${counts.treeSitterCount} files via tree-sitter, ${counts.regexCount} via regex fallback, ${skippedCount} unchanged`);
  }

  /**
   * Register files into DB and collect those needing symbol indexing.
   * SA4E-53: replaces prepare()+transaction() with runAsync()+transactionAsync().
   */
  private async registerFilesForIndex(files: ScannedFile[], projectId: string) {
    const filesToIndex: ScannedFile[] = [];
    let skippedCount = 0;
    const BATCH = 200;
    const insertSql = this.adapter.getEngine() === 'sqlite'
      ? `INSERT OR REPLACE INTO files (project_id,path,relative_path,language,module,content_hash,size_bytes,line_count,last_indexed,file_created_at,file_author,file_version) VALUES (?,?,?,?,?,?,?,?,${this.dialect.now()},?,?,?)`
      : `INSERT INTO files (project_id,path,relative_path,language,module,content_hash,size_bytes,line_count,last_indexed,file_created_at,file_author,file_version) VALUES (?,?,?,?,?,?,?,?,${this.dialect.now()},?,?,?) ON CONFLICT (project_id, path) DO UPDATE SET content_hash=EXCLUDED.content_hash, size_bytes=EXCLUDED.size_bytes, line_count=EXCLUDED.line_count, last_indexed=EXCLUDED.last_indexed, file_created_at=EXCLUDED.file_created_at, file_author=EXCLUDED.file_author, file_version=EXCLUDED.file_version`;
    for (let i = 0; i < files.length; i += BATCH) {
      const batch = files.slice(i, i + BATCH);
      await this.adapter.transactionAsync(async () => {
        for (const file of batch) {
          if (await isFileUnchanged(this.adapter, file, projectId)) { skippedCount++; continue; }
          filesToIndex.push(file);
          await this.adapter.runAsync(insertSql, [
            projectId, file.absolutePath, file.relativePath, file.language,
            detectModule(file.relativePath), file.contentHash, file.sizeBytes, file.lineCount,
            file.fileCreatedAt ?? null, file.fileAuthor ?? null, file.fileVersion ?? null,
          ]);
        }
      });
      await new Promise<void>(resolve => setImmediate(resolve));
    }
    return { filesToIndex, skippedCount };
  }

  private async indexFileSymbolsTreeSitter(filesToIndex: ScannedFile[], projectId: string) {
    let treeSitterCount = 0;
    let regexCount = 0;
    for (let i = 0; i < filesToIndex.length; i += 50) {
      const batch = filesToIndex.slice(i, i + 50).map(f => ({ absolutePath: f.absolutePath, relativePath: f.relativePath }));
      for (const result of await this.treeSitterIndexer!.indexFiles(batch, projectId)) {
        if (result.method === 'tree-sitter') treeSitterCount++; else regexCount++;
      }
    }
    return { treeSitterCount, regexCount };
  }

  /**
   * SA4E-53: replaced prepare()+transaction() with transactionAsync()+runAsync().
   * indexFileSymbolsRegex uses PreparedStatement internally (SQLite-only path).
   */
  private async indexFileSymbolsRegexFallback(filesToIndex: ScannedFile[], projectId: string) {
    logger.error('[indexer] Tree-sitter not available, using regex extraction');
    let regexCount = 0;
    const BATCH = 25;
    const insertSymbolSql = `INSERT INTO symbols (project_id,file_id,name,kind,signature,start_line,end_line,parent_symbol,visibility,doc_comment) VALUES (?,?,?,?,?,?,?,?,?,?)`;
    for (let i = 0; i < filesToIndex.length; i += BATCH) {
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

  private async upsertFile(file: ScannedFile, projectId: string): Promise<void> {
    await upsertFileInDb(this.adapter, file, projectId);
    if (this.treeSitterReady && this.treeSitterIndexer) {
      await this.treeSitterIndexer.indexFile(file.absolutePath, file.relativePath, projectId);
    } else {
      await upsertFileRegexFallback(this.adapter, file, projectId, logger);
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
