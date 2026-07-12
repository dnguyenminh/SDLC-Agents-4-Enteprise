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

const logger = pino({ name: 'indexing-engine' });
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class IndexingEngine {
  private db: Database.Database;
  private config: AppConfig;
  private watcher: FileWatcher | null = null;
  private running = false;
  private indexing = false;
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

  async runFullIndex(): Promise<void> {
    if (this.indexing) return;
    this.indexing = true;
    logger.error('[indexer] Starting full index...');
    try {
      const files = scanWorkspace(this.config);
      logger.error(`[indexer] Found ${files.length} files to index`);
      await this.indexFiles(files);
      updateModules(this.db);
      detectAndStorePatterns(this.db, new Map(), logger);
      if (this.graphRepo) {
        const resolved = this.graphRepo.resolveTargets(5000);
        if (resolved > 0) logger.error(`[indexer] Resolved ${resolved} cross-file symbol references`);
      }
      logSfdxStats(this.db, this.config, logger);
      logger.error('[indexer] Full index complete');
    } finally {
      this.indexing = false;
    }
  }

  async indexSingleFile(filePath: string): Promise<void> {
    const file = scanSingleFile(filePath, this.config.workspace);
    if (!file || isFileUnchanged(this.db, file)) return;
    await this.upsertFile(file);
  }

  removeFile(filePath: string): void {
    const relativePath = filePath.replace(/\\/g, '/');
    this.db.prepare('DELETE FROM files WHERE relative_path = ?').run(relativePath);
    this.graphRepo?.deleteFileRelationships(relativePath);
  }

  isRunning(): boolean { return this.indexing; }
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

  private async indexFiles(files: ScannedFile[]): Promise<void> {
    const insertFile = this.db.prepare(`INSERT OR REPLACE INTO files (path,relative_path,language,module,content_hash,size_bytes,line_count,last_indexed) VALUES (?,?,?,?,?,?,?,datetime('now'))`);
    const deleteSymbols = this.db.prepare('DELETE FROM symbols WHERE file_id = ?');
    const insertSymbol = this.db.prepare(`INSERT INTO symbols (file_id,name,kind,signature,start_line,end_line,parent_symbol,visibility,doc_comment) VALUES (?,?,?,?,?,?,?,?,?)`);
    const { filesToIndex, skippedCount } = this.registerFilesForIndex(files, insertFile);
    const counts = this.treeSitterReady && this.treeSitterIndexer
      ? await this.indexFileSymbolsTreeSitter(filesToIndex)
      : this.indexFileSymbolsRegexFallback(filesToIndex, deleteSymbols, insertSymbol);
    logger.error(`[indexer] Indexed ${counts.treeSitterCount} files via tree-sitter, ${counts.regexCount} via regex fallback, ${skippedCount} unchanged`);
  }

  private registerFilesForIndex(files: ScannedFile[], insertFile: Database.Statement) {
    const filesToIndex: ScannedFile[] = [];
    let skippedCount = 0;
    this.db.transaction((files: ScannedFile[]) => {
      for (const file of files) {
        if (isFileUnchanged(this.db, file)) { skippedCount++; continue; }
        filesToIndex.push(file);
        insertFile.run(file.absolutePath, file.relativePath, file.language, detectModule(file.relativePath), file.contentHash, file.sizeBytes, file.lineCount);
      }
    })(files);
    return { filesToIndex, skippedCount };
  }

  private async indexFileSymbolsTreeSitter(filesToIndex: ScannedFile[]) {
    let treeSitterCount = 0;
    let regexCount = 0;
    for (let i = 0; i < filesToIndex.length; i += 50) {
      const batch = filesToIndex.slice(i, i + 50).map(f => ({ absolutePath: f.absolutePath, relativePath: f.relativePath }));
      for (const result of await this.treeSitterIndexer!.indexFiles(batch)) {
        if (result.method === 'tree-sitter') treeSitterCount++; else regexCount++;
      }
    }
    return { treeSitterCount, regexCount };
  }

  private indexFileSymbolsRegexFallback(filesToIndex: ScannedFile[], deleteSymbols: Database.Statement, insertSymbol: Database.Statement) {
    logger.error('[indexer] Tree-sitter not available, using regex extraction');
    let regexCount = 0;
    this.db.transaction(() => {
      for (const file of filesToIndex) {
        const fileRow = this.db.prepare('SELECT id FROM files WHERE relative_path = ?').get(file.relativePath) as { id: number } | undefined;
        if (!fileRow) continue;
        deleteSymbols.run(fileRow.id);
        indexFileSymbolsRegex(file, fileRow.id, insertSymbol, logger);
        regexCount++;
      }
    })();
    return { treeSitterCount: 0, regexCount };
  }

  private async upsertFile(file: ScannedFile): Promise<void> {
    upsertFileInDb(this.db, file);
    if (this.treeSitterReady && this.treeSitterIndexer) {
      await this.treeSitterIndexer.indexFile(file.absolutePath, file.relativePath);
    } else {
      upsertFileRegexFallback(this.db, file, logger);
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
