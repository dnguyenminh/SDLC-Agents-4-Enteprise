/**
 * Full-index orchestration (BR-18 extraction from indexing-engine.ts).
 * Coordinates scan → register → index → resolve phases with abort support.
 */
import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import type { AppConfig } from '../config.js';
import { scanWorkspaceAsync } from './async-file-scanner.js';
import { IndexScope, resolveScope } from './index-scope.js';
import { ChecksumService } from './checksum-service.js';
import { FileChecksumRepository } from '../../database/repositories/FileChecksumRepository.js';
import { ScannedFile } from './file-scanner.js';
import { logSfdxStats } from './sfdx-helper.js';
import type pino from 'pino';

export type EmitProgressFn = (
  projectId: string, phase: 'scanning' | 'indexing' | 'resolving' | 'cancelled' | 'complete',
  current: number, total: number, currentFile?: string, skipped?: number,
) => void;

export interface FullIndexCtx {
  adapter: DatabaseAdapter;
  config: AppConfig;
  logger: pino.Logger;
  /** SA4E-41: per-project index guard (owned by IndexingEngine). */
  indexing: Set<string>;
  emitProgress: EmitProgressFn;
  /** SA4E-101: running tally of checksum-skipped files (updated during indexFiles). */
  getIndexSkipped: () => number;
  indexFiles: (files: ScannedFile[], projectId: string, signal?: AbortSignal, userId?: string, checksumService?: ChecksumService, storedChecksums?: Map<string, string>) => Promise<void>;
  registerWorkspace: (projectId: string, workspace: string, displayName?: string) => Promise<void>;
  runResolvePhases: (projectId: string) => Promise<void>;
}

export async function runFullIndex(
  ctx: FullIndexCtx, scope?: Partial<IndexScope>, signal?: AbortSignal, userId?: string,
): Promise<void> {
  const { projectId, workspace, displayName } = resolveScope(scope, {
    projectId: ctx.config.projectId,
    workspace: ctx.config.workspace,
  });
  if (ctx.indexing.has(projectId)) return; // per-project guard
  ctx.indexing.add(projectId);
  ctx.logger.error(`[indexer] Starting full index (project=${projectId})...`);
  await new Promise<void>(resolve => setImmediate(resolve));
  // ROOT-CAUSE FIX: register the workspace BEFORE scanning. The old code only
  // registered at the very END of this method, so a mid-run kill (tsx watch
  // restart, crash, abort early-return above/below) left project_registry
  // permanently empty. Registration is non-fatal (registerWorkspace catches).
  await ctx.registerWorkspace(projectId, workspace, displayName);
  try {
    // SA4E-101: Checksum service setup
    let checksumService: ChecksumService | undefined;
    let storedChecksums: Map<string, string> | undefined;
    if (userId) {
      checksumService = new ChecksumService(new FileChecksumRepository());
      storedChecksums = await checksumService.preloadChecksums(userId, projectId).catch(() => new Map());
    }
    // Phase: scanning (SA4E-78: async scan, non-blocking)
    ctx.emitProgress(projectId, 'scanning', 0, 0);
    const files = await scanWorkspaceAsync({ ...ctx.config, workspace });
    if (signal?.aborted) { ctx.emitProgress(projectId, 'cancelled', 0, 0); return; }

    ctx.logger.error(`[indexer] Found ${files.length} files to index`);
    // Phase: indexing
    ctx.emitProgress(projectId, 'indexing', 0, files.length);
    await ctx.indexFiles(files, projectId, signal, userId, checksumService, storedChecksums);
    if (signal?.aborted) { ctx.emitProgress(projectId, 'cancelled', 0, 0); return; }
    await ctx.runResolvePhases(projectId);
    logSfdxStats(ctx.adapter, ctx.config, ctx.logger);
    // Awaited (was fire-and-forget): refresh last_seen at successful completion.
    await ctx.registerWorkspace(projectId, workspace, displayName);

    ctx.emitProgress(projectId, 'complete', files.length, files.length, undefined, ctx.getIndexSkipped());
    ctx.logger.error('[indexer] Full index complete');
  } finally {
    ctx.indexing.delete(projectId);
  }
}
