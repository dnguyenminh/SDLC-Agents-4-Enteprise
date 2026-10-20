/**
 * Indexing batch pipeline — file registration + symbol indexing (BR-18
 * extraction from indexing-engine.ts). SA4E-53/SA4E-78/SA4E-101 semantics kept.
 */
import * as fs from 'fs';
import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import type { DialectHelper } from '../../database/dialect/DialectHelper.js';
import type { AppConfig } from '../config.js';
import type { ScannedFile } from './file-scanner.js';
import type { TreeSitterIndexer } from '../parsers/tree-sitter-indexer.js';
import { isFileUnchanged, indexFileSymbolsRegex } from './index-helper.js';
import { detectModule } from './module-helper.js';
import type { ProgressPhase } from './types.js';
import { ChecksumService } from './checksum-service.js';
import type pino from 'pino';

export type EmitProgressFn = (
  projectId: string, phase: ProgressPhase, current: number, total: number,
  currentFile?: string, skipped?: number,
) => void;

export interface FileBatchCtx {
  adapter: DatabaseAdapter;
  dialect: DialectHelper;
  config: AppConfig;
  logger: pino.Logger;
  treeSitterIndexer: TreeSitterIndexer | null;
  treeSitterReady: boolean;
  emitProgress: EmitProgressFn;
}

/**
 * Register files into DB and collect those needing symbol indexing.
 * SA4E-53: replaces prepare()+transaction() with runAsync()+transactionAsync().
 * SA4E-78: abort check at batch boundaries. SA4E-101: checksum-based skip.
 */
export async function registerFilesForIndex(
  ctx: FileBatchCtx, files: ScannedFile[], projectId: string,
  signal: AbortSignal | undefined, storedChecksums: Map<string, string> | undefined,
  checksumService: ChecksumService | undefined,
): Promise<{ filesToIndex: ScannedFile[]; skippedCount: number }> {
  const { adapter, dialect, emitProgress } = ctx;
  const filesToIndex: ScannedFile[] = [];
  let skippedCount = 0;
  const BATCH = 200;
  const insertSql = adapter.getEngine() === 'sqlite'
    ? `INSERT OR REPLACE INTO files (project_id,path,relative_path,language,module,content_hash,size_bytes,line_count,last_indexed,file_created_at,file_author,file_version) VALUES (?,?,?,?,?,?,?,?,${dialect.now()},?,?,?)`
    : `INSERT INTO files (project_id,path,relative_path,language,module,content_hash,size_bytes,line_count,last_indexed,file_created_at,file_author,file_version) VALUES (?,?,?,?,?,?,?,?,${dialect.now()},?,?,?) ON CONFLICT (project_id, path) DO UPDATE SET content_hash=EXCLUDED.content_hash, size_bytes=EXCLUDED.size_bytes, line_count=EXCLUDED.line_count, last_indexed=EXCLUDED.last_indexed, file_created_at=EXCLUDED.file_created_at, file_author=EXCLUDED.file_author, file_version=EXCLUDED.file_version`;
  for (let i = 0; i < files.length; i += BATCH) {
    if (signal?.aborted) break; // SA4E-78: cooperative cancellation
    const batch = files.slice(i, i + BATCH);
    await adapter.transactionAsync(async () => {
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
        if (await isFileUnchanged(adapter, file, projectId)) { skippedCount++; continue; }
        filesToIndex.push(file);
        await adapter.runAsync(insertSql, [
          projectId, file.absolutePath, file.relativePath, file.language,
          detectModule(file.relativePath), file.contentHash, file.sizeBytes, file.lineCount,
          file.fileCreatedAt ?? null, file.fileAuthor ?? null, file.fileVersion ?? null,
        ]);
      }
    });
    const lastFile = batch[batch.length - 1]?.relativePath || '';
    emitProgress(projectId, 'indexing', Math.min(i + BATCH, files.length), files.length, lastFile, skippedCount);
    await new Promise<void>(resolve => setImmediate(resolve));
  }
  return { filesToIndex, skippedCount };
}

export async function indexFileSymbolsTreeSitter(
  ctx: FileBatchCtx, filesToIndex: ScannedFile[], projectId: string, signal?: AbortSignal,
): Promise<{ treeSitterCount: number; regexCount: number }> {
  let treeSitterCount = 0;
  let regexCount = 0;
  for (let i = 0; i < filesToIndex.length; i += 50) {
    if (signal?.aborted) break; // SA4E-78: cooperative cancellation
    const batch = filesToIndex.slice(i, i + 50).map(f => ({ absolutePath: f.absolutePath, relativePath: f.relativePath }));
    for (const result of await ctx.treeSitterIndexer!.indexFiles(batch, projectId)) {
      if (result.method === 'tree-sitter') treeSitterCount++; else regexCount++;
    }
  }
  return { treeSitterCount, regexCount };
}

/**
 * SA4E-53: replaced prepare()+transaction() with transactionAsync()+runAsync().
 * SA4E-78: abort check at batch boundaries.
 */
export async function indexFileSymbolsRegexFallback(
  ctx: FileBatchCtx, filesToIndex: ScannedFile[], projectId: string, signal?: AbortSignal,
): Promise<{ treeSitterCount: number; regexCount: number }> {
  ctx.logger.error('[indexer] Tree-sitter not available, using regex extraction');
  let regexCount = 0;
  const BATCH = 25;
  for (let i = 0; i < filesToIndex.length; i += BATCH) {
    if (signal?.aborted) break; // SA4E-78: cooperative cancellation
    const batch = filesToIndex.slice(i, i + BATCH);
    await ctx.adapter.transactionAsync(async () => {
      for (const file of batch) {
        const fileRow = await ctx.adapter.getAsync<{ id: number }>(
          'SELECT id FROM files WHERE relative_path = ? AND project_id = ?',
          [file.relativePath, projectId],
        );
        if (!fileRow) continue;
        await ctx.adapter.runAsync('DELETE FROM symbols WHERE file_id = ?', [fileRow.id]);
        await indexFileSymbolsRegex(file, fileRow.id, projectId, ctx.adapter, ctx.logger);
        regexCount++;
      }
    });
    await new Promise<void>(resolve => setImmediate(resolve));
  }
  return { treeSitterCount: 0, regexCount };
}
