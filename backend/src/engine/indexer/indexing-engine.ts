/** Indexing Engine — Full scan and incremental indexing. KSA-145. */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import pino from 'pino';
import { DatabaseManager } from '../db/database-manager.js';
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
import { getAdminDb } from '../../admin/admin-db.js';

const logger = pino({ name: 'indexing-engine' });
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class IndexingEngine {
  private db: Database.Database;
  private config: AppConfig;
  private watcher: FileWatcher | null = null;
  private running = false;
  private indexing = new Set<string>(); // SA4E-41: per-project index guard
  private treeSitterIndexer: TreeSitterIndexer | null = null;
  private grammarRegistry: GrammarRegistry | null = null;
  private graphRepo: GraphRepository | null = null;
  private treeSitterReady = false;

  constructor(dbManager: DatabaseManager, config: AppConfig) {
    this.db = dbManager.getDb();
    this.config = config;
    this.initTreeSitter();
  }

  private initTreeSitter(): void {
    try {
      if (!isGraphSchemaReady(this.db)) runGraphMigrations(this.db);
      this.graphRepo = new GraphRepository(this.db);
      const configPath = [path.resolve(__dirname, '../parsers/grammar-config.json'), path.resolve(__dirname, '../../src/parsers/grammar-config.json')].find(fs.existsSync);
      if (configPath) {
        const grammarConfig = loadGrammarConfig(configPath);
        this.grammarRegistry = new GrammarRegistry(grammarConfig);
        this.treeSitterIndexer = new TreeSitterIndexer(this.grammarRegistry, this.db, this.config.maxFileSize);
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

  async startBackgroundIndexing(): Promise<void> {
    this.running = true;
    await this.runFullIndex();
    this.startWatcher();
  }

  async runFullIndex(scope?: Partial<IndexScope>): Promise<void> {
    const { projectId, workspace } = resolveScope(scope, {
      projectId: this.config.projectId,
      workspace: this.config.workspace,
    });
    if (this.indexing.has(projectId)) return; // per-project guard
    this.indexing.add(projectId);
    logger.error(`[indexer] Starting full index (project=${projectId})...`);
    try {
      const files = scanWorkspace({ ...this.config, workspace });
      logger.error(`[indexer] Found ${files.length} files to index`);
      await this.indexFiles(files, projectId);
      updateModules(this.db, projectId);
      detectAndStorePatterns(this.db, new Map(), logger, projectId);
      if (this.graphRepo) {
        const resolved = this.graphRepo.resolveTargets(5000, projectId);
        if (resolved > 0) logger.error(`[indexer] Resolved ${resolved} cross-file symbol references`);
      }
      this.syncGraphNodes(projectId);
      logSfdxStats(this.db, this.config, logger);
      logger.error('[indexer] Full index complete');
    } finally {
      this.indexing.delete(projectId);
    }
  }

  /** Project this tenant's code symbols into admin.db graph_nodes (non-fatal). */
  private syncGraphNodes(projectId: string): void {
    try {
      const adminDb = getAdminDb();
      new GraphSyncService(this.db, adminDb, logger).syncProjectSymbols(projectId);
    } catch (err) {
      logger.error({ err }, '[indexer] Graph node sync skipped');
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
    if (!file || isFileUnchanged(this.db, file, projectId)) return;
    await this.upsertFile(file, projectId);
  }

  removeFile(filePath: string): void {
    const relativePath = filePath.replace(/\\/g, '/');
    const projectId = this.bootProjectId(); // SEC-06: boot-tenant scope only
    this.db.prepare('DELETE FROM files WHERE relative_path = ? AND project_id = ?').run(relativePath, projectId);
    this.graphRepo?.deleteFileRelationships(relativePath, projectId);
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
  getSfdxStats() { return getSfdxStatsImpl(this.db, this.config); }

  private async indexFiles(files: ScannedFile[], projectId: string): Promise<void> {
    const insertFile = this.db.prepare(`INSERT OR REPLACE INTO files (project_id,path,relative_path,language,module,content_hash,size_bytes,line_count,last_indexed) VALUES (?,?,?,?,?,?,?,?,datetime('now'))`);
    const deleteSymbols = this.db.prepare('DELETE FROM symbols WHERE file_id = ?');
    const insertSymbol = this.db.prepare(`INSERT INTO symbols (project_id,file_id,name,kind,signature,start_line,end_line,parent_symbol,visibility,doc_comment) VALUES (?,?,?,?,?,?,?,?,?,?)`);
    const { filesToIndex, skippedCount } = this.registerFilesForIndex(files, insertFile, projectId);
    const counts = this.treeSitterReady && this.treeSitterIndexer
      ? await this.indexFileSymbolsTreeSitter(filesToIndex, projectId)
      : this.indexFileSymbolsRegexFallback(filesToIndex, deleteSymbols, insertSymbol, projectId);
    logger.error(`[indexer] Indexed ${counts.treeSitterCount} files via tree-sitter, ${counts.regexCount} via regex fallback, ${skippedCount} unchanged`);
  }

  private registerFilesForIndex(files: ScannedFile[], insertFile: Database.Statement, projectId: string) {
    const filesToIndex: ScannedFile[] = [];
    let skippedCount = 0;
    this.db.transaction((files: ScannedFile[]) => {
      for (const file of files) {
        if (isFileUnchanged(this.db, file, projectId)) { skippedCount++; continue; }
        filesToIndex.push(file);
        insertFile.run(projectId, file.absolutePath, file.relativePath, file.language, detectModule(file.relativePath), file.contentHash, file.sizeBytes, file.lineCount);
      }
    })(files);
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

  private indexFileSymbolsRegexFallback(filesToIndex: ScannedFile[], deleteSymbols: Database.Statement, insertSymbol: Database.Statement, projectId: string) {
    logger.error('[indexer] Tree-sitter not available, using regex extraction');
    let regexCount = 0;
    this.db.transaction(() => {
      for (const file of filesToIndex) {
        const fileRow = this.db.prepare('SELECT id FROM files WHERE relative_path = ? AND project_id = ?').get(file.relativePath, projectId) as { id: number } | undefined;
        if (!fileRow) continue;
        deleteSymbols.run(fileRow.id);
        indexFileSymbolsRegex(file, fileRow.id, projectId, insertSymbol, logger);
        regexCount++;
      }
    })();
    return { treeSitterCount: 0, regexCount };
  }

  private async upsertFile(file: ScannedFile, projectId: string): Promise<void> {
    upsertFileInDb(this.db, file, projectId);
    if (this.treeSitterReady && this.treeSitterIndexer) {
      await this.treeSitterIndexer.indexFile(file.absolutePath, file.relativePath, projectId);
    } else {
      upsertFileRegexFallback(this.db, file, projectId, logger);
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
