/** SA4E-415 — SnapshotRetrievalService (16K Doc §11): every path enforces the
 *  snapshot pin via pinOrThrow(); only READY snapshots retrievable; direct vs
 *  inferred evidence separated; build/config/test discovery first-class. */

import type { QueryDatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import pino from 'pino';
import {
  classifyPath,
  cosineSimilarity,
  fuseRankedList,
  type CategoryHit,
  type HybridHit,
  type LexicalHit,
  type RelationshipHit,
  type SnapshotInfo,
  type SymbolHit,
  type VectorHit,
} from './retrieval-types.js';
import { bfsGraph } from './graph-traversal.js';

const logger = pino({ name: 'snapshot-retrieval' });

export class SnapshotRetrievalService {
  constructor(private readonly db: QueryDatabaseAdapter) {}

  /** Every path calls this first — THE snapshot enforcement point. */
  async pinOrThrow(snapshotId: string, expectedRepositoryId?: string): Promise<SnapshotInfo> {
    const row = await this.db.getAsync<{ id: string; repository_id: string; commit_id: string; status: string }>(
      `SELECT id, repository_id, commit_id, status FROM code_index_snapshot WHERE id = ?`,
      [snapshotId],
    );
    if (!row) throw new Error(`SNAPSHOT_NOT_FOUND: ${snapshotId}`);
    if (row.status !== 'READY') throw new Error(`SNAPSHOT_NOT_READY: ${snapshotId} is ${row.status}`);
    if (expectedRepositoryId && row.repository_id !== expectedRepositoryId) {
      throw new Error(`SNAPSHOT_REPOSITORY_MISMATCH: ${snapshotId} belongs to ${row.repository_id}`);
    }
    return { id: row.id, repositoryId: row.repository_id, commitId: row.commit_id, status: row.status };
  }

  /** Resolve ref → active snapshot via repository_ref_index_state (must be READY). */
  async resolveActiveSnapshot(repositoryId: string, refName: string): Promise<SnapshotInfo> {
    const row = await this.db.getAsync<{ id: string; status: string; repository_id: string; commit_id: string }>(
      `SELECT s.id, s.status, s.repository_id, s.commit_id
       FROM repository_ref_index_state rs
       JOIN code_index_snapshot s ON s.id = rs.active_code_index_snapshot_id
       WHERE rs.repository_id = ? AND rs.ref_name = ?`,
      [repositoryId, refName],
    );
    if (!row) throw new Error(`ACTIVE_SNAPSHOT_NOT_FOUND: ${repositoryId}@${refName}`);
    if (row.status !== 'READY') throw new Error(`SNAPSHOT_NOT_READY: ${row.id} is ${row.status}`);
    return { id: row.id, repositoryId: row.repository_id, commitId: row.commit_id, status: row.status };
  }

  /** Exact definition > proven reference > text similarity (symbol questions). */
  async symbolByName(snapshotId: string, name: string, limit = 10): Promise<SymbolHit[]> {
    await this.pinOrThrow(snapshotId);
    const hits = new Map<string, SymbolHit>();
    const exact = await this.db.allAsync<any>(
      `SELECT id, name, kind, signature, start_line, end_line FROM code_symbol
       WHERE snapshot_id = ? AND name = ? ORDER BY kind, start_line LIMIT ?`,
      [snapshotId, name, limit],
    );
    for (const r of exact) {
      hits.set(r.id, { ...r, rankSource: 'exact-definition' });
    }
    if (hits.size < limit) {
      const proven = await this.db.allAsync<any>(
        `SELECT DISTINCT s2.id, s2.name, s2.kind, s2.signature, s2.start_line, s2.end_line
         FROM code_symbol src
         JOIN symbol_occurrence occ ON occ.symbol_id = src.id AND occ.snapshot_id = src.snapshot_id
         JOIN symbol_occurrence_resolution res ON res.occurrence_id = occ.id AND res.resolution_kind = 'EXACT'
         JOIN code_symbol s2 ON s2.id = res.resolved_symbol_id AND s2.snapshot_id = src.snapshot_id
         WHERE src.snapshot_id = ? AND src.name = ? LIMIT ?`,
        [snapshotId, name, limit],
      );
      for (const r of proven) {
        if (!hits.has(r.id)) hits.set(r.id, { ...r, rankSource: 'proven-reference' });
      }
    }
    if (hits.size < limit) {
      const like = await this.db.allAsync<any>(
        `SELECT id, name, kind, signature, start_line, end_line FROM code_symbol
         WHERE snapshot_id = ? AND name LIKE ? AND name != ? ORDER BY name LIMIT ?`,
        [snapshotId, `%${name}%`, name, limit],
      );
      for (const r of like) {
        if (!hits.has(r.id)) hits.set(r.id, { ...r, rankSource: 'text-similarity' });
      }
    }
    const rank = { 'exact-definition': 0, 'proven-reference': 1, 'text-similarity': 2 } as const;
    return [...hits.values()].slice(0, limit).sort((a, b) => rank[a.rankSource] - rank[b.rankSource] || a.name.localeCompare(b.name));
  }

  async lexicalSearch(snapshotId: string, ftsQuery: string, limit = 10): Promise<LexicalHit[]> {
    await this.pinOrThrow(snapshotId);
    return this.db.allAsync<LexicalHit>(
      `SELECT f.chunk_id AS chunkId, c.sfr_id AS sfrId, c.start_line AS startLine,
              c.end_line AS endLine, bm25(code_chunk_fts) AS bm25Rank
       FROM code_chunk_fts f
       JOIN code_chunk c ON c.id = f.chunk_id
       WHERE code_chunk_fts MATCH ? AND c.snapshot_id = ?
       ORDER BY bm25Rank LIMIT ?`,
      [ftsQuery, snapshotId, limit],
    );
  }

  /** Exact cosine scan (SQLite MVP — no ANN index; HNSW only on the pgvector
   *  upgrade path per ADR-001; do NOT assume single HNSW + WHERE suffices —
   *  prefer per-snapshot prefiltered indexes at multi-repo scale). */
  async vectorSearch(
    snapshotId: string,
    modelKey: string,
    modelVersion: string,
    queryEmbedding: Buffer,
    limit = 10,
  ): Promise<VectorHit[]> {
    await this.pinOrThrow(snapshotId);
    const rows = await this.db.allAsync<{ chunk_id: string; content_ref: string | null; embedding: Buffer }>(
      `SELECT c.id AS chunk_id, c.content_ref, e.embedding
       FROM code_embedding e
       JOIN embedding_set es ON es.id = e.embedding_set_id
       JOIN code_chunk c ON c.id = e.chunk_id
       WHERE es.code_index_snapshot_id = ? AND es.model_key = ? AND es.model_version = ?`,
      [snapshotId, modelKey, modelVersion],
    );
    return rows
      .map((r) => ({ chunkId: r.chunk_id, contentRef: r.content_ref, similarity: cosineSimilarity(queryEmbedding, r.embedding) }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  /** Direct (PROVEN evidence) vs inferred (heuristic/unproven) — kept separate. */
  async relationshipsOf(snapshotId: string, symbolId: string): Promise<RelationshipHit[]> {
    await this.pinOrThrow(snapshotId);
    const rows = await this.db.allAsync<any>(
      `SELECT r.id, r.from_symbol_id, r.to_symbol_id, r.kind, r.confidence,
              CASE WHEN ev.id IS NOT NULL THEN 'direct' ELSE 'inferred' END AS evidence
       FROM symbol_relationship r
       LEFT JOIN relationship_evidence ev ON ev.relationship_id = r.id AND ev.evidence_kind = 'PROVEN'
       WHERE r.snapshot_id = ? AND (r.from_symbol_id = ? OR r.to_symbol_id = ?)
       ORDER BY r.kind, r.id`,
      [snapshotId, symbolId, symbolId],
    );
    return rows.map((r) => ({
      id: r.id,
      fromSymbolId: r.from_symbol_id,
      toSymbolId: r.to_symbol_id,
      kind: r.kind,
      confidence: r.confidence,
      evidence: r.evidence as RelationshipHit['evidence'],
    }));
  }

  async graphFrom(snapshotId: string, rootSymbolId: string, opts?: { maxDepth?: number; nodeCap?: number; kinds?: string[] }) {
    await this.pinOrThrow(snapshotId);
    return bfsGraph(this.db, snapshotId, rootSymbolId, opts);
  }

  /** Build/config/test discovery — snapshot-scoped via commit+repo join. */
  async discoverCategory(snapshotId: string, category: 'build' | 'config' | 'test', limit = 25): Promise<CategoryHit[]> {
    await this.pinOrThrow(snapshotId);
    const rows = await this.db.allAsync<{ id: string; relative_path: string; language: string | null }>(
      `SELECT sfr.id, sfr.relative_path, sfr.language
       FROM source_file_revision sfr
       JOIN code_index_snapshot s
         ON s.commit_id = sfr.commit_id AND s.repository_id = sfr.repository_id
       WHERE s.id = ? AND sfr.is_binary = 0
       ORDER BY sfr.relative_path`,
      [snapshotId],
    );
    return rows
      .filter((r) => classifyPath(r.relative_path) === category)
      .slice(0, limit)
      .map((r) => ({ category, relativePath: r.relative_path, sfrId: r.id, language: r.language }));
  }

  /** Hybrid: lexical (BM25) + vector (cosine) + graph expansion, RRF-fused. */
  async hybridSearch(
    snapshotId: string,
    opts: { modelKey: string; modelVersion: string; queryEmbedding: Buffer; lexicalQuery: string; rootSymbolId?: string; limit?: number },
  ): Promise<HybridHit[]> {
    await this.pinOrThrow(snapshotId);
    const limit = opts.limit ?? 10;
    const fused = new Map<string, HybridHit>();
    const lexical = await this.lexicalSearch(snapshotId, opts.lexicalQuery, limit);
    fuseRankedList(fused, 'lexical', lexical.map((h) => h.chunkId));
    const vector = await this.vectorSearch(snapshotId, opts.modelKey, opts.modelVersion, opts.queryEmbedding, limit);
    fuseRankedList(fused, 'vector', vector.map((h) => h.chunkId));
    if (opts.rootSymbolId) {
      const nodes = await bfsGraph(this.db, snapshotId, opts.rootSymbolId, { maxDepth: 1, nodeCap: limit });
      if (nodes.length > 0) {
        const placeholders = nodes.map(() => '?').join(',');
        const chunkRows = await this.db.allAsync<{ id: string }>(
          `SELECT id FROM code_chunk WHERE snapshot_id = ? AND symbol_id IN (${placeholders}) ORDER BY chunk_index`,
          [snapshotId, ...nodes.map((n) => n.id)],
        );
        fuseRankedList(fused, 'graph', chunkRows.map((r) => r.id));
      }
    }
    return [...fused.values()].sort((a, b) => b.fusedScore - a.fusedScore).slice(0, limit);
  }
}
