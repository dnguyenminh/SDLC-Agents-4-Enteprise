/**
 * Single-file upsert + removal paths (BR-18 extraction from indexing-engine.ts).
 * Used by indexSingleFile / removeFile on the IndexingEngine facade.
 */
import * as fs from 'fs';
import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import type { AppConfig } from '../config.js';
import type { ScannedFile } from './file-scanner.js';
import type { TreeSitterIndexer } from '../parsers/tree-sitter-indexer.js';
import { upsertFileInDb, upsertFileRegexFallback } from './index-helper.js';
import { DependencyResolver } from '../parsers/dependency-resolver.js';
import type { IndexResult } from '../parsers/types.js';
import type pino from 'pino';

export interface FileUpsertCtx {
  adapter: DatabaseAdapter;
  config: AppConfig;
  logger: pino.Logger;
  treeSitterIndexer: TreeSitterIndexer | null;
  treeSitterReady: boolean;
}

export async function upsertFile(ctx: FileUpsertCtx, file: ScannedFile, projectId: string): Promise<IndexResult | null> {
  await upsertFileInDb(ctx.adapter, file, projectId);
  if (ctx.treeSitterReady && ctx.treeSitterIndexer) {
    return await ctx.treeSitterIndexer.indexFile(file.absolutePath, file.relativePath, projectId);
  }
  await upsertFileRegexFallback(ctx.adapter, file, projectId, ctx.logger);
  return indexWithDependencyResolver(ctx, file);
}

/** Regex-fallback path: resolve dependencies so single-file index stays useful. */
function indexWithDependencyResolver(ctx: FileUpsertCtx, file: ScannedFile): IndexResult | null {
  try {
    const source = fs.readFileSync(file.absolutePath, 'utf-8');
    const depResolver = new DependencyResolver();
    const dependencies = depResolver.resolve(source, file.relativePath, ctx.config.workspace);
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

/** Remove a file + its graph relationships (fire-and-forget, boot-tenant scoped). */
export function removeFileRows(
  ctx: FileUpsertCtx, graphRepo: { deleteFileRelationships: (relativePath: string, projectId: string) => Promise<unknown> } | null,
  filePath: string, projectId: string,
): void {
  const relativePath = filePath.replace(/\\/g, '/');
  // SA4E-53: fire-and-forget async (non-fatal for watcher events)
  ctx.adapter.runAsync('DELETE FROM files WHERE relative_path = ? AND project_id = ?', [relativePath, projectId])
    .catch(err => ctx.logger.error({ err }, '[indexer] removeFile run failed'));
  graphRepo?.deleteFileRelationships(relativePath, projectId)
    .catch(err => ctx.logger.error({ err }, '[indexer] removeFile deleteFileRelationships failed'));
}
