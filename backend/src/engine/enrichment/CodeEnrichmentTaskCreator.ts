/**
 * SA4E-107: Code Enrichment Task Creator.
 * Creates CODE_ENRICHMENT tasks after indexing. Skips already-enriched symbols.
 * Cross-scope dedup: skips LLM if same content_hash already enriched in another project/scope.
 * Non-blocking: failures don't affect the indexing pipeline (BR-01).
 * BR-18 facade — insert logic lives in ./CodeEnrichmentTaskCreator/task-insert.ts,
 * cross-scope copy in ./CodeEnrichmentTaskCreator/cross-scope.ts.
 */

import type { Logger } from 'pino';
import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import { isPegaKind } from '../../modules/pega/pega-mapping.js';
import {
  copyEnrichmentFromOtherScope as copyFromScope,
  isFileEnrichedInOtherScope as isEnrichedInOtherScope,
} from './CodeEnrichmentTaskCreator/cross-scope.js';
import {
  ENRICHABLE_KINDS,
  getSymbolKind as lookupSymbolKind,
  insertTask as insertEnrichmentTask,
  shouldCreateTask as checkShouldCreateTask,
} from './CodeEnrichmentTaskCreator/task-insert.js';

/**
 * Creates CODE_ENRICHMENT tasks for newly indexed symbols.
 * Injected into IndexingEngine, called after storeResults().
 */
export class CodeEnrichmentTaskCreator {
  constructor(
    private readonly adapter: DatabaseAdapter,
    private readonly logger: Logger,
  ) {}

  /**
   * Create enrichment tasks for symbols that haven't been enriched yet.
   * Skips if same file content_hash already enriched in another project (cross-scope dedup).
   * @param symbolIds - Map of symbol name to symbol ID from storeResults()
   * @param filePath - Relative file path of indexed file
   * @param projectId - Tenant project ID
   * @returns Number of tasks created
   */
  async createTasks(
    symbolIds: Map<string, number>,
    filePath: string,
    projectId: string,
  ): Promise<number> {
    if (symbolIds.size === 0) return 0;

    // SA4E-106: Cross-scope dedup — copy enrichment data instead of just skipping
    const enrichedElsewhere = await this.isFileEnrichedInOtherScope(filePath, projectId);
    if (enrichedElsewhere) {
      const copied = await this.copyEnrichmentFromOtherScope(filePath, projectId);
      this.logger.debug({ filePath, projectId, copied },
        '[enrichment] Cross-scope copy — enrichment data copied from another scope');
      return 0; // No new LLM tasks needed
    }

    let created = 0;
    for (const [symbolName, symbolId] of symbolIds) {
      if (symbolId <= 0) continue;
      const shouldCreate = await this.shouldCreateTask(symbolId);
      if (!shouldCreate) continue;

      const kind = await this.getSymbolKind(symbolId);
      if (!kind || (!ENRICHABLE_KINDS.has(kind) && !isPegaKind(kind))) continue;

      await this.insertTask(symbolId, symbolName, kind, filePath, projectId);
      created++;
    }

    if (created > 0) {
      this.logger.debug({ created, filePath, projectId }, '[enrichment] Tasks created');
    }
    return created;
  }

  /**
   * Create enrichment tasks for all unenriched symbols in a project.
   * Called after full indexing — queries symbols table directly.
   * Cross-scope dedup: skips files whose content_hash is already enriched elsewhere.
   * @param projectId - Tenant project ID
   * @returns Number of tasks created
   */
  async createTasksForProject(projectId: string): Promise<number> {
    const symbols = await this.adapter.allAsync<{ id: number; name: string; kind: string; file_path: string }>(
      `SELECT s.id, s.name, s.kind, f.relative_path as file_path
       FROM symbols s JOIN files f ON s.file_id = f.id
       WHERE s.project_id = ?
         AND (s.enrichment_status IS NULL OR s.enrichment_status = 'FAILED'
              OR (s.enrichment_status = 'COMPLETED' AND s.summary IS NULL))
       LIMIT 500`,
      [projectId],
    );

    // Batch cross-scope check: collect unique file paths, check which are already enriched
    const filePathsToCheck = [...new Set(symbols.map(s => s.file_path))];
    const skippedFiles = new Set<string>();
    for (const fp of filePathsToCheck) {
      if (await this.isFileEnrichedInOtherScope(fp, projectId)) {
        skippedFiles.add(fp);
      }
    }

    if (skippedFiles.size > 0) {
      this.logger.info({ skipped: skippedFiles.size, projectId }, '[enrichment] Files skipped — already enriched in another scope');
    }

    let created = 0;
    for (const sym of symbols) {
      if (!ENRICHABLE_KINDS.has(sym.kind) && !isPegaKind(sym.kind)) continue;
      if (skippedFiles.has(sym.file_path)) continue; // Cross-scope dedup
      await this.insertTask(sym.id, sym.name, sym.kind, sym.file_path, projectId);
      created++;
    }

    if (created > 0) {
      this.logger.info({ created, projectId }, '[enrichment] Batch tasks created for project');
    }
    return created;
  }

  /** Skip if symbol already fully enriched (has summary). */
  private shouldCreateTask(symbolId: number): Promise<boolean> {
    return checkShouldCreateTask(this.adapter, symbolId);
  }

  /** Copy enrichment data from an already-enriched scope (SA4E-106). */
  private copyEnrichmentFromOtherScope(filePath: string, projectId: string): Promise<number> {
    return copyFromScope(this.adapter, filePath, projectId);
  }

  /** Cross-scope dedup check against other projects. */
  private isFileEnrichedInOtherScope(filePath: string, currentProjectId: string): Promise<boolean> {
    return isEnrichedInOtherScope(this.adapter, filePath, currentProjectId);
  }

  private getSymbolKind(symbolId: number): Promise<string | null> {
    return lookupSymbolKind(this.adapter, symbolId);
  }

  private insertTask(
    symbolId: number, symbolName: string, kind: string,
    filePath: string, projectId: string,
  ): Promise<void> {
    return insertEnrichmentTask(this.adapter, symbolId, symbolName, kind, filePath, projectId);
  }
}
