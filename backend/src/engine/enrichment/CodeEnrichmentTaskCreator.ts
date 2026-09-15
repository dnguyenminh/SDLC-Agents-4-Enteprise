/**
 * SA4E-107: Code Enrichment Task Creator.
 * Creates CODE_ENRICHMENT tasks after indexing. Skips already-enriched symbols.
 * Cross-scope dedup: skips LLM if same content_hash already enriched in another project/scope.
 * Non-blocking: failures don't affect the indexing pipeline (BR-01).
 */

import type { Logger } from 'pino';
import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import { DialectHelper } from '../../database/dialect/DialectHelper.js';
import { TaskType, TaskStatus } from '../../modules/memory/task-queue/models.js';
import { isPegaKind } from '../../modules/pega/pega-mapping.js';

/**
 * Kinds eligible for enrichment — every non-trivial code symbol must be LLM-enriched.
 * Includes Salesforce-specific kinds (apex_class, trigger) so Apex entities get
 * summary + pseudo code like any other class/function. Trivial symbols (variables,
 * constants, fields, properties) are intentionally excluded.
 */
const ENRICHABLE_KINDS = new Set([
  // Class-like
  'class', 'interface', 'enum', 'apex_class',
  // Function-like
  'function', 'method', 'arrow_function', 'generator', 'constructor', 'trigger',
  // Salesforce declarative metadata + component properties (summary only, no pseudo code)
  'property', 'sf_field', 'sf_object', 'lwc_component', 'aura_component',
  'flow', 'visualforce_page',
]);

/**
 * Creates CODE_ENRICHMENT tasks for newly indexed symbols.
 * Injected into IndexingEngine, called after storeResults().
 */
export class CodeEnrichmentTaskCreator {
  private readonly dialect: DialectHelper;
  constructor(
    private readonly adapter: DatabaseAdapter,
    private readonly logger: Logger,
  ) {
    this.dialect = new DialectHelper(adapter.getEngine());
  }

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
  private async shouldCreateTask(symbolId: number): Promise<boolean> {
    const row = await this.adapter.getAsync<{ enrichment_status: string | null; summary: string | null }>(
      'SELECT enrichment_status, summary FROM symbols WHERE id = ?',
      [symbolId],
    );
    // Skip only if COMPLETED AND has summary (CODE_ENRICHMENT done, not just TAG_ENRICHMENT)
    return !(row?.enrichment_status === 'COMPLETED' && row?.summary);
  }

  /**
   * SA4E-106: Copy enrichment data from an already-enriched scope to current project.
   * Matches by file content_hash + symbol name + kind.
   * Uses COALESCE for pseudo_code to preserve PegaLogicNormalizer output.
   * @param filePath - Relative file path in current project
   * @param projectId - Current project ID
   * @returns Number of symbols updated
   */
  private async copyEnrichmentFromOtherScope(filePath: string, projectId: string): Promise<number> {
    const sourceFileId = await this.findSourceFileId(filePath, projectId);
    if (!sourceFileId) return 0;

    const targetFileId = await this.findTargetFileId(filePath, projectId);
    if (!targetFileId) return 0;

    const sourceSymbols = await this.loadEnrichedSymbols(sourceFileId);
    return this.applyEnrichmentCopy(sourceSymbols, targetFileId);
  }

  /** Find a source file (another project) with enriched symbols for same content. */
  private async findSourceFileId(filePath: string, projectId: string): Promise<number | null> {
    const currentFile = await this.adapter.getAsync<{ content_hash: string }>(
      'SELECT content_hash FROM files WHERE relative_path = ? AND project_id = ?',
      [filePath, projectId],
    );
    if (!currentFile?.content_hash) return null;

    const sourceFile = await this.adapter.getAsync<{ id: number }>(
      `SELECT f.id FROM files f
       JOIN symbols s ON s.file_id = f.id
       WHERE f.content_hash = ? AND f.project_id != ?
         AND s.enrichment_status = 'COMPLETED'
       LIMIT 1`,
      [currentFile.content_hash, projectId],
    );
    return sourceFile?.id ?? null;
  }

  /** Get the target file ID in the current project. */
  private async findTargetFileId(filePath: string, projectId: string): Promise<number | null> {
    const targetFile = await this.adapter.getAsync<{ id: number }>(
      'SELECT id FROM files WHERE relative_path = ? AND project_id = ?',
      [filePath, projectId],
    );
    return targetFile?.id ?? null;
  }

  /** Load enriched symbols from source file. */
  private async loadEnrichedSymbols(sourceFileId: number) {
    return this.adapter.allAsync<{
      name: string; kind: string; summary: string | null;
      pseudo_code: string | null; llm_tags: string | null;
    }>(
      `SELECT name, kind, summary, pseudo_code, llm_tags FROM symbols
       WHERE file_id = ? AND enrichment_status = 'COMPLETED'`,
      [sourceFileId],
    );
  }

  /** Apply enrichment copy from source symbols to target file symbols. */
  private async applyEnrichmentCopy(
    sourceSymbols: { name: string; kind: string; summary: string | null; pseudo_code: string | null; llm_tags: string | null }[],
    targetFileId: number,
  ): Promise<number> {
    let copied = 0;
    for (const src of sourceSymbols) {
      if (!src.summary) continue;
      const result = await this.adapter.runAsync(
        `UPDATE symbols SET
           summary = ?,
           pseudo_code = COALESCE(?, pseudo_code),
           llm_tags = ?,
           enrichment_status = 'COMPLETED',
           enriched_at = ${this.dialect.now()}
         WHERE file_id = ? AND name = ? AND kind = ?
           AND (enrichment_status IS NULL OR enrichment_status != 'COMPLETED')`,
        [src.summary, src.pseudo_code, src.llm_tags, targetFileId, src.name, src.kind],
      );
      if (result?.changes && result.changes > 0) copied++;
    }
    return copied;
  }

  /**
   * Cross-scope dedup: check if the same file (by content_hash) has already been
   * enriched in another project. If yes, skip LLM task creation entirely.
   */
  private async isFileEnrichedInOtherScope(filePath: string, currentProjectId: string): Promise<boolean> {
    try {
      const sourceId = await this.findSourceFileId(filePath, currentProjectId);
      return sourceId !== null;
    } catch {
      // Non-fatal: if query fails (table missing, etc.), proceed with task creation
      return false;
    }
  }

  private async getSymbolKind(symbolId: number): Promise<string | null> {
    const row = await this.adapter.getAsync<{ kind: string }>(
      'SELECT kind FROM symbols WHERE id = ?', [symbolId],
    );
    return row?.kind ?? null;
  }

  private async insertTask(
    symbolId: number, symbolName: string, kind: string,
    filePath: string, projectId: string,
  ): Promise<void> {
    // Dedup guard: avoid duplicate PENDING/PROCESSING tasks for same symbol/project
    const exists = await this.adapter.getAsync<{ id: number }>(
      `SELECT id FROM pending_tasks WHERE task_type = ? AND entry_id = ? AND project_id = ? AND status IN (?, ?) LIMIT 1`,
      [TaskType.CODE_ENRICHMENT, symbolId, projectId, TaskStatus.PENDING, TaskStatus.PROCESSING],
    );
    if (exists) return;

    // SA4E-171: dynamically set workspaceType based on symbol kind
    const payload = JSON.stringify({
      symbolId, symbolName, symbolKind: kind,
      projectId, filePath,
      workspaceType: isPegaKind(kind) ? 'pega' : 'standard',
    });

    const now = new Date().toISOString();
    await this.adapter.runAsync(
      `INSERT INTO pending_tasks (task_type, entry_id, status, payload, max_retries, project_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [TaskType.CODE_ENRICHMENT, symbolId, TaskStatus.PENDING, payload, 3, projectId, now],
    );
  }
}
