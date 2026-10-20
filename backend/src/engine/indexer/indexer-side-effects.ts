/**
 * Indexer post-indexing side effects (BR-18 extraction from indexing-engine.ts).
 * Workspace registration, graph node sync, enrichment tasks, resolving phases.
 */
import * as path from 'path';
import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import type { AppConfig } from '../config.js';
import { GraphRepository } from '../graph/graph-repository.js';
import { GraphRepository as AdminGraphRepository } from '../../database/repositories/GraphRepository.js';
import { GraphSyncService } from '../graph/graph-sync-service.js';
import { CodeEnrichmentTaskCreator } from '../enrichment/CodeEnrichmentTaskCreator.js';
import { updateModules, detectAndStorePatterns } from './module-helper.js';
import { logSfdxStats } from './sfdx-helper.js';
import type pino from 'pino';

export interface SideEffectCtx {
  adapter: DatabaseAdapter;
  config: AppConfig;
  logger: pino.Logger;
  graphRepo: GraphRepository | null;
  graphSyncService: GraphSyncService;
  enrichmentTaskCreator: CodeEnrichmentTaskCreator;
  emitProgress: (projectId: string, phase: 'resolving', current: number, total: number) => void;
}

/**
 * Register workspace in project_registry so admin dropdown shows it (non-fatal).
 * PUBLIC: the file-events route calls this for tenants that only ever push
 * incremental events (POST /api/index/file-events never runs runFullIndex).
 *
 * MUST be awaited by callers — the previous sync `try/catch` wrapper could not
 * catch the `registerProject` promise rejection, so a failed INSERT on
 * PostgreSQL became a silent unhandled rejection (no warn log, empty table).
 * Uses THIS engine's adapter (unified-DB contract, SA4E-49) instead of the
 * global getDbAdapter() so it writes wherever index data is written.
 */
export async function registerWorkspace(ctx: SideEffectCtx, projectId: string, workspace: string, displayName?: string): Promise<void> {
  try {
    const repo = new AdminGraphRepository(ctx.adapter);
    // Prefer the client's real workspace name (X-Workspace-Root). The `workspace`
    // arg is a synthetic temp scan dir named after projectId, so its basename would
    // wrongly make display_name === project_id. Fall back to it only when no real
    // name was provided (e.g. boot-time indexing of the actual config.workspace).
    const name = displayName || path.basename(workspace);
    await repo.registerProject(projectId, name, workspace);
  } catch (err) {
    ctx.logger.warn({ err, projectId }, '[indexer] project_registry upsert skipped (non-fatal)');
  }
}

/** Project this tenant's code symbols into graph_nodes in index DB (non-fatal). SA4E-53: async. SA4E-78: cached. */
export async function syncGraphNodes(ctx: SideEffectCtx, projectId: string): Promise<void> {
  try {
    await ctx.graphSyncService.syncProjectSymbols(projectId);
  } catch (err) {
    ctx.logger.error({ err }, '[indexer] Graph node sync skipped');
  }
}

/** SA4E-107: Create enrichment tasks for unenriched symbols (non-fatal, BR-01). */
export async function createEnrichmentTasks(ctx: SideEffectCtx, projectId: string): Promise<void> {
  try {
    await ctx.enrichmentTaskCreator.createTasksForProject(projectId);
  } catch (err) {
    ctx.logger.warn({ err }, '[indexer] Enrichment task creation skipped (non-fatal)');
  }
}

/** Phase: resolving + graph sync + enrichment tasks (post-indexing side effects). */
export async function runResolvePhases(ctx: SideEffectCtx, projectId: string): Promise<void> {
  ctx.emitProgress(projectId, 'resolving', 0, 0);
  await new Promise<void>(resolve => setImmediate(resolve));
  await updateModules(ctx.adapter, projectId);
  await new Promise<void>(resolve => setImmediate(resolve));
  await detectAndStorePatterns(ctx.adapter, new Map(), ctx.logger, projectId);
  if (ctx.graphRepo) {
    await new Promise<void>(resolve => setImmediate(resolve));
    const resolved = await ctx.graphRepo.resolveTargets(5000, projectId);
    if (resolved > 0) ctx.logger.error(`[indexer] Resolved ${resolved} cross-file symbol references`);
  }
  await new Promise<void>(resolve => setImmediate(resolve));
  await syncGraphNodes(ctx, projectId);
  await new Promise<void>(resolve => setImmediate(resolve));
  // SA4E-107: Create enrichment tasks (non-blocking — failures don't affect indexing)
  await createEnrichmentTasks(ctx, projectId);
  await new Promise<void>(resolve => setImmediate(resolve));
}

/** KSA-191 surface kept on the engine: sfdx stats logging after full index. */
export function logSfdxStatsFor(ctx: SideEffectCtx): void {
  logSfdxStats(ctx.adapter, ctx.config, ctx.logger);
}
