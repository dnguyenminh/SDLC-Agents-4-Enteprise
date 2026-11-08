/**
 * SA4E-415 — Retrieval & Ranking types (16K Doc §11).
 *
 * Invariants:
 *  - code_index_snapshot_id is the PRIMARY filter of every retrieval path.
 *  - Only READY snapshots are retrievable (enforced by pinOrThrow).
 *  - Direct (proven) vs inferred (heuristic) evidence is separated in results.
 *  - Build/config/test discovery is a first-class retrieval category.
 */

export type EvidenceKind = 'direct' | 'inferred';

export interface SnapshotInfo {
  id: string;
  repositoryId: string;
  commitId: string;
  status: string;
}

export interface SymbolHit {
  id: string;
  name: string;
  kind: string;
  signature: string | null;
  startLine: number;
  endLine: number;
  /** rank source: exact definition > proven reference > text similarity */
  rankSource: 'exact-definition' | 'proven-reference' | 'text-similarity';
}

export interface LexicalHit {
  chunkId: string;
  sfrId: string;
  startLine: number;
  endLine: number;
  bm25Rank: number;
}

export interface VectorHit {
  chunkId: string;
  contentRef: string | null;
  similarity: number;
}

export interface RelationshipHit {
  id: string;
  fromSymbolId: string;
  toSymbolId: string | null;
  kind: string;
  confidence: number | null;
  evidence: EvidenceKind;
}

export interface CategoryHit {
  category: 'build' | 'config' | 'test';
  relativePath: string;
  sfrId: string;
  language: string | null;
}

export interface HybridHit {
  chunkId: string;
  /** Reciprocal Rank Fusion score — higher is better. */
  fusedScore: number;
  contributing: Array<{ source: 'lexical' | 'vector' | 'graph'; rank: number }>;
}

/** Build/config/test discovery — first-class retrieval category (16K Doc §11). */
export type RetrievalCategory = 'build' | 'config' | 'test';

/** Classify a workspace-relative path into a retrieval category (or null). */
export function classifyPath(relativePath: string): RetrievalCategory | null {
  const p = relativePath.replaceAll('\\', '/');
  if (/(^|\/)(tests?|__tests__)\//i.test(p) || /\.(test|spec)\.[a-z]+$/i.test(p) || /(^|\/)test_[^/]+\.py$/i.test(p)) {
    return 'test';
  }
  if (/(^|\/)(pom\.xml|build\.gradle(\.kts)?|makefile|cmakelists\.txt|package\.json|[^/]*\.csproj)$/i.test(p)) {
    return 'build';
  }
  if (/\.(json|ya?ml|properties|toml|ini|conf|env)$/i.test(p) || /\.config\./i.test(p) || /(^|\/)(\.github|\.vscode)\//i.test(p) || /dockerfile/i.test(p)) {
    return 'config';
  }
  return null;
}

/** Cosine similarity over float32-packed BLOBs (exact scan on SQLite). */
export function cosineSimilarity(a: Buffer, b: Buffer): number {
  const n = Math.min(a.byteLength, b.byteLength) / 4;
  if (n === 0) return 0;
  const fa = new Float32Array(a.buffer, a.byteOffset, n);
  const fb = new Float32Array(b.buffer, b.byteOffset, n);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += fa[i] * fb[i];
    na += fa[i] * fa[i];
    nb += fb[i] * fb[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Reciprocal Rank Fusion — stable, parameter-light hybrid merge.
 * fused = Σ 1 / (RRF_K + rank) across contributing lists (rank starts at 1).
 */
export const RRF_K = 60;

export function fuseRankedList(
  fused: Map<string, HybridHit>,
  source: 'lexical' | 'vector' | 'graph',
  rankedIds: string[],
): void {
  rankedIds.forEach((id, idx) => {
    const rank = idx + 1;
    const existing = fused.get(id);
    const contribution = { source, rank };
    if (existing) {
      existing.fusedScore += 1 / (RRF_K + rank);
      existing.contributing.push(contribution);
    } else {
      fused.set(id, { chunkId: id, fusedScore: 1 / (RRF_K + rank), contributing: [contribution] });
    }
  });
}
