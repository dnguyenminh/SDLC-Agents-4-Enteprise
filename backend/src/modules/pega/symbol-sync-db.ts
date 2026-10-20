/** Pega symbol sync DB upserts (BR-18 extraction from PegaSymbolSync). */
import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import { TaskType, TaskStatus } from '../memory/task-queue/models.js';

/** UPSERT virtual file entry (BR-02, BR-05). */
export async function upsertVirtualFile(
  adapter: DatabaseAdapter, projectId: string, virtualPath: string,
  module: string, contentHash: string, sizeBytes: number,
): Promise<number> {
  const engine = adapter.getEngine();
  if (engine === 'postgresql') {
    const row = await adapter.getAsync<{ id: number }>(
      `INSERT INTO files (project_id, path, relative_path, language, module, content_hash, size_bytes, line_count)
       VALUES ($1, $2, $3, 'pega', $4, $5, $6, 1)
       ON CONFLICT(project_id, path) DO UPDATE SET
         content_hash = EXCLUDED.content_hash, size_bytes = EXCLUDED.size_bytes
       RETURNING id`,
      [projectId, virtualPath, virtualPath, module, contentHash, sizeBytes],
    );
    return row!.id;
  }
  // SQLite path
  await adapter.runAsync(
    `INSERT INTO files (project_id, path, relative_path, language, module, content_hash, size_bytes, line_count)
     VALUES (?, ?, ?, 'pega', ?, ?, ?, 1)
     ON CONFLICT(project_id, path) DO UPDATE SET
       content_hash = excluded.content_hash, size_bytes = excluded.size_bytes`,
    [projectId, virtualPath, virtualPath, module, contentHash, sizeBytes],
  );
  const row = await adapter.getAsync<{ id: number }>(
    'SELECT id FROM files WHERE project_id = ? AND path = ?',
    [projectId, virtualPath],
  );
  return row!.id;
}

/** UPSERT symbol entry (BR-01, BR-03, BR-04). */
export async function upsertSymbol(
  adapter: DatabaseAdapter, projectId: string, fileId: number,
  name: string, kind: string, signature: string,
  parentSymbol: string, docComment: string,
): Promise<number> {
  const engine = adapter.getEngine();
  // Delete existing symbol for this file (1:1 virtual file → symbol)
  await adapter.runAsync(
    'DELETE FROM symbols WHERE file_id = ? AND project_id = ?',
    [fileId, projectId],
  );
  if (engine === 'postgresql') {
    const row = await adapter.getAsync<{ id: number }>(
      `INSERT INTO symbols (project_id, file_id, name, kind, signature, start_line, end_line, parent_symbol, visibility, doc_comment)
       VALUES ($1, $2, $3, $4, $5, 1, 1, $6, 'public', $7)
       RETURNING id`,
      [projectId, fileId, name, kind, signature, parentSymbol, docComment],
    );
    return row!.id;
  }
  const result = await adapter.runAsync(
    `INSERT INTO symbols (project_id, file_id, name, kind, signature, start_line, end_line, parent_symbol, visibility, doc_comment)
     VALUES (?, ?, ?, ?, ?, 1, 1, ?, 'public', ?)`,
    [projectId, fileId, name, kind, signature, parentSymbol, docComment],
  );
  return result.lastInsertRowid as number;
}

/** Store rule JSON body in body_embeddings for loadBodyText() (OI-04). */
export async function storeBodyEmbedding(
  adapter: DatabaseAdapter, projectId: string, symbolId: number, body: string,
): Promise<void> {
  const buf = Buffer.from(body, 'utf-8');
  const tokenCount = Math.ceil(body.length / 4); // Rough token estimate
  const engine = adapter.getEngine();
  if (engine === 'postgresql') {
    await adapter.runAsync(
      `INSERT INTO body_embeddings (project_id, symbol_id, chunk_index, embedding, token_count)
       VALUES ($1, $2, 0, $3, $4)
       ON CONFLICT(project_id, symbol_id, chunk_index) DO UPDATE SET
         embedding = EXCLUDED.embedding, token_count = EXCLUDED.token_count`,
      [projectId, symbolId, buf, tokenCount],
    );
  } else {
    await adapter.runAsync(
      `INSERT INTO body_embeddings (project_id, symbol_id, chunk_index, embedding, token_count)
       VALUES (?, ?, 0, ?, ?)
       ON CONFLICT(project_id, symbol_id, chunk_index) DO UPDATE SET
         embedding = excluded.embedding, token_count = excluded.token_count`,
      [projectId, symbolId, buf, tokenCount],
    );
  }
}

/** Create CODE_ENRICHMENT task if symbol not already fully enriched (BR-07 amended). */
export async function createEnrichmentTaskIfNeeded(
  adapter: DatabaseAdapter, symbolId: number, symbolName: string,
  kind: string, filePath: string, projectId: string,
  pegaClass?: string, pegaRuleset?: string,
): Promise<void> {
  // Skip only if CODE_ENRICHMENT already produced summary (not just TAG_ENRICHMENT tags)
  const sym = await adapter.getAsync<{ enrichment_status: string | null; summary: string | null }>(
    'SELECT enrichment_status, summary FROM symbols WHERE id = ? AND project_id = ?',
    [symbolId, projectId],
  );
  if (sym?.enrichment_status === 'COMPLETED' && sym.summary) return;

  const payload = JSON.stringify({
    symbolId, symbolName, symbolKind: kind,
    projectId, filePath, workspaceType: 'pega',
    pegaClass, pegaRuleset,
  });

  const now = new Date().toISOString();
  await adapter.runAsync(
    `INSERT INTO pending_tasks (task_type, entry_id, status, payload, max_retries, project_id, created_at)
     VALUES (?, ?, ?, ?, 3, ?, ?)`,
    [TaskType.CODE_ENRICHMENT, symbolId, TaskStatus.PENDING, payload, projectId, now],
  );
}
