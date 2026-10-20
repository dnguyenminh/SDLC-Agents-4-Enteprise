/**
 * SA4E-106: Cross-scope enrichment copy helpers.
 * Extracted from CodeEnrichmentTaskCreator (BR-18) — free functions taking the
 * adapter explicitly; no behavior change.
 */

import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';

/** Find a source file (another project) with enriched symbols for same content. */
export async function findSourceFileId(
  adapter: DatabaseAdapter, filePath: string, projectId: string,
): Promise<number | null> {
  const currentFile = await adapter.getAsync<{ content_hash: string }>(
    'SELECT content_hash FROM files WHERE relative_path = ? AND project_id = ?',
    [filePath, projectId],
  );
  if (!currentFile?.content_hash) return null;

  const sourceFile = await adapter.getAsync<{ id: number }>(
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
export async function findTargetFileId(
  adapter: DatabaseAdapter, filePath: string, projectId: string,
): Promise<number | null> {
  const targetFile = await adapter.getAsync<{ id: number }>(
    'SELECT id FROM files WHERE relative_path = ? AND project_id = ?',
    [filePath, projectId],
  );
  return targetFile?.id ?? null;
}

/** Load enriched symbols from source file. */
export function loadEnrichedSymbols(adapter: DatabaseAdapter, sourceFileId: number) {
  return adapter.allAsync<{
    name: string; kind: string; summary: string | null;
    pseudo_code: string | null; llm_tags: string | null;
  }>(
    `SELECT name, kind, summary, pseudo_code, llm_tags FROM symbols
     WHERE file_id = ? AND enrichment_status = 'COMPLETED'`,
    [sourceFileId],
  );
}

/** Apply enrichment copy from source symbols to target file symbols. */
export async function applyEnrichmentCopy(
  adapter: DatabaseAdapter,
  sourceSymbols: { name: string; kind: string; summary: string | null; pseudo_code: string | null; llm_tags: string | null }[],
  targetFileId: number,
): Promise<number> {
  let copied = 0;
  for (const src of sourceSymbols) {
    if (!src.summary) continue;
    const result = await adapter.runAsync(
      `UPDATE symbols SET
         summary = ?,
         pseudo_code = COALESCE(?, pseudo_code),
         llm_tags = ?,
         enrichment_status = 'COMPLETED',
         enriched_at = datetime('now')
       WHERE file_id = ? AND name = ? AND kind = ?
         AND (enrichment_status IS NULL OR enrichment_status != 'COMPLETED')`,
      [src.summary, src.pseudo_code, src.llm_tags, targetFileId, src.name, src.kind],
    );
    if (result?.changes && result.changes > 0) copied++;
  }
  return copied;
}

/**
 * SA4E-106: Copy enrichment data from an already-enriched scope to current project.
 * Matches by file content_hash + symbol name + kind.
 * Uses COALESCE for pseudo_code to preserve PegaLogicNormalizer output.
 * @param adapter - Database adapter
 * @param filePath - Relative file path in current project
 * @param projectId - Current project ID
 * @returns Number of symbols updated
 */
export async function copyEnrichmentFromOtherScope(
  adapter: DatabaseAdapter, filePath: string, projectId: string,
): Promise<number> {
  const sourceFileId = await findSourceFileId(adapter, filePath, projectId);
  if (!sourceFileId) return 0;

  const targetFileId = await findTargetFileId(adapter, filePath, projectId);
  if (!targetFileId) return 0;

  const sourceSymbols = await loadEnrichedSymbols(adapter, sourceFileId);
  return applyEnrichmentCopy(adapter, sourceSymbols, targetFileId);
}

/**
 * Cross-scope dedup: check if the same file (by content_hash) has already been
 * enriched in another project. If yes, skip LLM task creation entirely.
 */
export async function isFileEnrichedInOtherScope(
  adapter: DatabaseAdapter, filePath: string, currentProjectId: string,
): Promise<boolean> {
  try {
    const sourceId = await findSourceFileId(adapter, filePath, currentProjectId);
    return sourceId !== null;
  } catch {
    // Non-fatal: if query fails (table missing, etc.), proceed with task creation
    return false;
  }
}
