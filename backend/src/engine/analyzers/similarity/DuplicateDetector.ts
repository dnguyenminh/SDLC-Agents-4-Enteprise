/**
 * KSA-168: Duplicate Detector — Find near-duplicate code using embedding similarity.
 * Uses cosine similarity on body embeddings + Union-Find clustering.
 */

import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import { ClusterBuilder } from './ClusterBuilder.js';
import type { SimilarityPair, DuplicateCluster, DuplicateReport, ClusterMember } from './types.js';
import { buildCodeScopeFilter } from '../../query/code-intel-isolation.js';

interface EmbeddingRow {
  symbol_id: number;
  chunk_index: number;
  embedding: Buffer;
  token_count: number;
}

interface SymbolRow {
  id: number;
  name: string;
  kind: string;
  start_line: number;
  end_line: number;
  file_path: string;
}

export class DuplicateDetector {
  private adapter: DatabaseAdapter;
  private minSimilarity: number;
  private minLines: number;
  private projectId: string | undefined;

  /**
   * @param projectId  SA4E-41 tenant scope. Undefined ⇒ fail-closed (no rows).
   */
  constructor(adapter: DatabaseAdapter, minSimilarity: number = 0.85, minLines: number = 5, projectId?: string) {
    this.adapter = adapter;
    this.minSimilarity = minSimilarity;
    this.minLines = minLines;
    this.projectId = projectId;
  }

  /** Find duplicate functions in the codebase. */
  detect(options: { filePath?: string; module?: string; limit?: number } = {}): DuplicateReport {
    const t0 = performance.now();

    // 1. Load body embeddings with symbol info
    const embeddings = this.loadEmbeddings(options.filePath, options.module);
    if (embeddings.length < 2) {
      return { clusters: [], totalPairsScanned: 0, totalDuplicates: 0, scanDurationMs: 0 };
    }

    // 2. Compute pairwise similarities
    const pairs = this.computeSimilarities(embeddings);

    // 3. Build clusters using Union-Find
    const clusters = this.buildClusters(pairs, embeddings);

    const limit = options.limit ?? 20;
    const topClusters = clusters.slice(0, limit);

    const elapsed = performance.now() - t0;
    return {
      clusters: topClusters,
      totalPairsScanned: (embeddings.length * (embeddings.length - 1)) / 2,
      totalDuplicates: clusters.reduce((sum, c) => sum + c.members.length, 0),
      scanDurationMs: Math.round(elapsed),
    };
  }

  private loadEmbeddings(filePath?: string, module?: string): Array<{ symbolId: number; vector: number[]; info: SymbolRow }> {
    const scope = buildCodeScopeFilter(this.projectId, 's'); // fail-closed
    let sql = `
      SELECT be.symbol_id, be.chunk_index, be.embedding, be.token_count,
             s.id, s.name, s.kind, s.start_line, s.end_line, f.relative_path as file_path
      FROM body_embeddings be
      JOIN symbols s ON s.id = be.symbol_id
      JOIN files f ON f.id = s.file_id
      WHERE be.chunk_index = 0
        AND (s.end_line - s.start_line) >= ?
        AND ${scope.clause}
    `;
    const params: unknown[] = [this.minLines, ...scope.params];

    if (filePath) {
      sql += ` AND f.relative_path LIKE ?`;
      params.push(`%${filePath}%`);
    }
    if (module) {
      sql += ` AND f.module = ?`;
      params.push(module);
    }

    const rows = this.adapter.prepare(sql).all(...params) as Array<EmbeddingRow & SymbolRow>;

    return rows.map(row => ({
      symbolId: row.symbol_id,
      vector: deserializeVector(row.embedding),
      info: {
        id: row.symbol_id,
        name: row.name,
        kind: row.kind,
        start_line: row.start_line,
        end_line: row.end_line,
        file_path: row.file_path,
      },
    }));
  }

  private computeSimilarities(
    embeddings: Array<{ symbolId: number; vector: number[]; info: SymbolRow }>
  ): SimilarityPair[] {
    const pairs: SimilarityPair[] = [];

    for (let i = 0; i < embeddings.length; i++) {
      for (let j = i + 1; j < embeddings.length; j++) {
        const sim = cosineSimilarity(embeddings[i].vector, embeddings[j].vector);
        if (sim >= this.minSimilarity) {
          pairs.push({
            symbolIdA: embeddings[i].symbolId,
            symbolIdB: embeddings[j].symbolId,
            nameA: embeddings[i].info.name,
            nameB: embeddings[j].info.name,
            filePathA: embeddings[i].info.file_path,
            filePathB: embeddings[j].info.file_path,
            similarity: sim,
          });
        }
      }
    }

    return pairs.sort((a, b) => b.similarity - a.similarity);
  }

  private buildClusters(
    pairs: SimilarityPair[],
    embeddings: Array<{ symbolId: number; vector: number[]; info: SymbolRow }>
  ): DuplicateCluster[] {
    const uf = new ClusterBuilder();
    const infoMap = new Map(embeddings.map(e => [e.symbolId, e.info]));
    const pairSims = new Map<string, number>();

    for (const pair of pairs) {
      uf.union(pair.symbolIdA, pair.symbolIdB);
      const key = [pair.symbolIdA, pair.symbolIdB].sort().join(':');
      pairSims.set(key, pair.similarity);
    }

    const rawClusters = uf.getClusters();
    const clusters: DuplicateCluster[] = [];

    for (const [root, memberIds] of rawClusters) {
      const members: ClusterMember[] = memberIds.map(id => {
        const info = infoMap.get(id);
        return {
          symbolId: id,
          name: info?.name ?? '<unknown>',
          filePath: info?.file_path ?? '',
          startLine: info?.start_line ?? 0,
          endLine: info?.end_line ?? 0,
          tokenCount: 0,
        };
      });

      // Compute average similarity within cluster
      let totalSim = 0;
      let simCount = 0;
      for (let i = 0; i < memberIds.length; i++) {
        for (let j = i + 1; j < memberIds.length; j++) {
          const key = [memberIds[i], memberIds[j]].sort().join(':');
          const sim = pairSims.get(key);
          if (sim !== undefined) {
            totalSim += sim;
            simCount++;
          }
        }
      }

      const avgSim = simCount > 0 ? totalSim / simCount : 0;
      const suggestion = this.generateSuggestion(members);

      clusters.push({
        id: `cluster-${root}`,
        members,
        avgSimilarity: avgSim,
        suggestion,
      });
    }

    return clusters.sort((a, b) => b.avgSimilarity - a.avgSimilarity);
  }

  private generateSuggestion(members: ClusterMember[]): string {
    const files = new Set(members.map(m => m.filePath));
    if (files.size === 1) {
      return `Extract shared logic from ${members.length} similar functions in ${[...files][0]}`;
    }
    return `Consider extracting a shared utility from ${members.length} similar functions across ${files.size} files`;
  }
}

/** Deserialize Float32Array from Buffer. */
function deserializeVector(buf: Buffer): number[] {
  const floats = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  return Array.from(floats);
}

/** Cosine similarity between two vectors. */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
