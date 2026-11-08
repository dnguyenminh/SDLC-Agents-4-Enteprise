/**
 * SA4E-419 — Embedding pipeline: V6 snapshot tables → zero-fat chunks →
 * embedding_set / code_embedding / FTS5 (§5 + §4).
 *
 * Separation of concerns (§10.4):
 *  - ensureSnapshotChunks(): chunking belongs to the PARSE — runs once per
 *    snapshot (stage H part 1); idempotent (skips when chunks already exist).
 *  - embedSnapshotChunks(): creates a NEW embedding_set + code_embedding rows
 *    referencing the EXISTING chunks — change model WITHOUT reparse. The
 *    embedding text is recovered from code_chunk_fts (stored at chunk time).
 *
 * Embedding content = [fp] + [sig] + [doc] + [deps.calls] — body NEVER embedded.
 */

import { randomUUID } from 'node:crypto';
import type { QueryDatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import pino from 'pino';
import {
  chunkFile,
  estimateTokens,
  type ASTCodeChunk,
  type ChunkDeps,
  type ChunkSymbolInput,
} from './ast-chunker.js';

const logger = pino({ name: 'embedding-pipeline' });

export interface EmbedModelConfig {
  modelKey: string;
  modelVersion: string;
  dimensions: number;
  preprocessingVersion: string;
  tokenizerVersion: string;
  chunkerVersion: string;
}

export interface EmbedStats {
  snapshotId: string;
  embeddingSetId: string;
  /** chunks available for this snapshot (created now or previously). */
  chunksAvailable: number;
  /** true when chunking ran in this call (first embed for the snapshot). */
  chunkedNow: boolean;
  embeddedCount: number;
  embeddedTexts: string[];
}

/** Stage H part 1 — chunk once per snapshot (idempotent). */
export async function ensureSnapshotChunks(
  db: QueryDatabaseAdapter,
  snapshotId: string,
  projectId: string,
  sourceLoader?: (relativePath: string) => Promise<string>,
): Promise<boolean> {
  const existing = await db.getAsync<{ c: number }>(
    `SELECT COUNT(*) AS c FROM code_chunk WHERE snapshot_id = ?`,
    [snapshotId],
  );
  if ((existing?.c ?? 0) > 0) return false;

  const symbols = await db.allAsync<any>(
    `SELECT cs.id, cs.name, cs.kind, cs.signature, cs.doc_comment, cs.start_line, cs.end_line,
            cs.parent_id, cs.sfr_id, f.relative_path
     FROM code_symbol cs
     LEFT JOIN source_file_revision f ON f.id = cs.sfr_id
     WHERE cs.snapshot_id = ?
     ORDER BY f.relative_path, cs.start_line`,
    [snapshotId],
  );
  const rels = await db.allAsync<any>(
    `SELECT from_symbol_id, to_symbol_id, kind FROM symbol_relationship WHERE snapshot_id = ?`,
    [snapshotId],
  );

  const symbolsByFile = new Map<string, ChunkSymbolInput[]>();
  const external: ChunkSymbolInput[] = [];
  for (const s of symbols) {
    const input: ChunkSymbolInput = {
      id: s.id, name: s.name, kind: s.kind, signature: s.signature,
      docComment: s.doc_comment, startLine: s.start_line, endLine: s.end_line,
      parentId: s.parent_id, sfrId: s.sfr_id ?? null, isExternal: false,
    };
    if (s.relative_path) {
      const list = symbolsByFile.get(s.relative_path) ?? [];
      list.push(input);
      symbolsByFile.set(s.relative_path, list);
    } else {
      external.push(input);
    }
  }

  const nameById = new Map(symbols.map((s) => [s.id, s.name]));
  const depsBySymbolId = new Map<string, ChunkDeps>();
  for (const r of rels) {
    const deps = depsBySymbolId.get(r.from_symbol_id) ?? { imports: [], calls: [], refs_types: [] };
    const targetName = nameById.get(r.to_symbol_id) ?? r.to_symbol_id;
    if (r.kind === 'CALLS') deps.calls.push(targetName);
    else if (r.kind === 'IMPORTS') deps.imports.push(targetName);
    else if (r.kind === 'USES' || r.kind === 'INHERITS') deps.refs_types.push(targetName);
    depsBySymbolId.set(r.from_symbol_id, deps);
  }

  const loader = sourceLoader ?? (async () => '');
  const chunks: ASTCodeChunk[] = [];
  for (const [filePath, syms] of symbolsByFile) {
    const source = await loader(filePath);
    chunks.push(...chunkFile({ filePath, source, symbols: syms, depsBySymbolId }));
  }
  for (const ext of external) {
    chunks.push(...chunkFile({ filePath: '<external>', source: '', symbols: [{ ...ext, isExternal: true }], depsBySymbolId }));
  }

  const chunkIndexByFile = new Map<string, number>();
  for (const chunk of chunks) {
    const rowId = randomUUID();
    const nextIdx = chunkIndexByFile.get(chunk.fp) ?? 0;
    chunkIndexByFile.set(chunk.fp, nextIdx + 1);
    await db.runAsync(
      `INSERT INTO code_chunk (id, project_id, snapshot_id, symbol_id, sfr_id, chunk_index,
         start_line, end_line, content_ref, token_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [rowId, projectId, snapshotId, chunk.symbol_id, chunk.sfr_id, nextIdx,
       chunk.rng[0], chunk.rng[1], `ast:${chunk.id}`, estimateTokens(chunk.body)],
    );
    // FTS content = the embedding text ([fp]+[sig]+[doc]+[deps.calls], no body)
    await db.runAsync(
      `INSERT INTO code_chunk_fts (chunk_id, content) VALUES (?, ?)`,
      [rowId, `${chunk.fp}\n${chunk.sig}\n${chunk.doc ?? ''}${chunk.deps.calls.length ? `\ncalls: ${chunk.deps.calls.join(', ')}` : ''}`],
    );
  }
  logger.info({ snapshotId, chunks: chunks.length }, '[embedding-pipeline] snapshot chunked');
  return true;
}

/** Create a NEW embedding_set over the EXISTING chunks (§10.4 — no reparse). */
export async function embedSnapshotChunks(
  db: QueryDatabaseAdapter,
  snapshotId: string,
  projectId: string,
  model: EmbedModelConfig,
  embedFn: (text: string) => Buffer,
  sourceLoader?: (relativePath: string) => Promise<string>,
): Promise<EmbedStats> {
  const chunkedNow = await ensureSnapshotChunks(db, snapshotId, projectId, sourceLoader);

  const rows = await db.allAsync<{ id: string; content: string }>(
    `SELECT c.id, f.content
     FROM code_chunk c
     JOIN code_chunk_fts f ON f.chunk_id = c.id
     WHERE c.snapshot_id = ?
     ORDER BY c.id`,
    [snapshotId],
  );

  const setId = randomUUID();
  await db.runAsync(
    `INSERT INTO embedding_set (id, project_id, code_index_snapshot_id, model_key, model_version,
       dimensions, preprocessing_version, tokenizer_version, chunker_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [setId, projectId, snapshotId, model.modelKey, model.modelVersion, model.dimensions,
     model.preprocessingVersion, model.tokenizerVersion, model.chunkerVersion],
  );

  const embeddedTexts: string[] = [];
  for (const row of rows) {
    const vector = embedFn(row.content);
    await db.runAsync(
      `INSERT INTO code_embedding (project_id, embedding_set_id, chunk_id, embedding) VALUES (?, ?, ?, ?)`,
      [projectId, setId, row.id, vector],
    );
    embeddedTexts.push(row.content);
  }

  logger.info(
    { snapshotId, embeddingSetId: setId, embedded: rows.length, chunkedNow },
    '[embedding-pipeline] embedding set created',
  );
  return {
    snapshotId,
    embeddingSetId: setId,
    chunksAvailable: rows.length,
    chunkedNow,
    embeddedCount: rows.length,
    embeddedTexts,
  };
}
