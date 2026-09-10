/**
 * SA4E-91 — Code Edge Extractor.
 * Extracts IMPORTS, EXTENDS, and CALLS edges from code intelligence data
 * (code_dependencies, code_call_graph, symbols) after graph node projection.
 * Non-blocking, best-effort: failures never break the index run.
 */

import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import type { Logger } from 'pino';

/** A graph edge extracted from code intelligence tables. */
export interface CodeGraphEdge {
  source: string;
  target: string;
  label: string;
  weight: number;
}

/** Strategy interface for code edge extraction. */
export interface CodeEdgeStrategy {
  /** Extract edges for the given project from the index DB. */
  extract(indexAdapter: DatabaseAdapter, projectId: string): Promise<CodeGraphEdge[]>;
}

/** Extracts CONTAINS edges from file → symbol (file membership) for symbols without parent_symbol, e.g., LWC_COMPONENT. */
export class FileContainsSymbolStrategy implements CodeEdgeStrategy {
  async extract(indexAdapter: DatabaseAdapter, projectId: string): Promise<CodeGraphEdge[]> {
    // Map file_id to a synthetic node? For now create edge from file pseudo node to symbol.
    // If graph_nodes uses file nodes with entry_id 'file:{file_id}', we can connect.
    // Fallback: connect symbol to itself? Instead create CONTAINS from a synthetic file container.
    // Simpler: create edge from symbol to symbol of same file where parent is the file's main component?
    // We'll create CONTAINS from the first symbol of each file of kind lwc_component/apex_class/class to all other symbols in same file.
    const rows = await indexAdapter.allAsync<{ child_id: number; parent_id: number }>(
      `SELECT s1.id AS child_id, s2.id AS parent_id
       FROM symbols s1
       JOIN symbols s2
         ON s2.project_id = s1.project_id
        AND s2.file_id = s1.file_id
        AND s2.kind IN ('lwc_component','apex_class','class')
       WHERE s1.project_id = ?
         AND s1.parent_symbol IS NULL
         AND s2.parent_symbol IS NULL
         AND s1.id <> s2.id`,
      [projectId],
    );
    return rows.map(r => ({
      source: `code:${r.parent_id}`,
      target: `code:${r.child_id}`,
      label: 'CONTAINS',
      weight: 0.4,
    }));
  }
}

/** Extracts CONTAINS edges from parent_symbol → child symbols (membership). */
export class MembershipEdgeStrategy implements CodeEdgeStrategy {
  async extract(indexAdapter: DatabaseAdapter, projectId: string): Promise<CodeGraphEdge[]> {
    const rows = await indexAdapter.allAsync<{ child_id: number; parent_id: number }>(
      `SELECT DISTINCT child.id AS child_id, parent.id AS parent_id
       FROM symbols child
       JOIN symbols parent
         ON parent.name = child.parent_symbol
        AND parent.project_id = child.project_id
       WHERE child.project_id = ?
         AND child.parent_symbol IS NOT NULL`,
      [projectId],
    );
    return rows.map(r => ({
      source: `code:${r.parent_id}`,
      target: `code:${r.child_id}`,
      label: 'CONTAINS',
      weight: 0.5,
    }));
  }
}

/** Extracts edges from relationships table — source of truth for tree-sitter indexer. */
export class RelationshipsEdgeStrategy implements CodeEdgeStrategy {
  async extract(indexAdapter: DatabaseAdapter, projectId: string): Promise<CodeGraphEdge[]> {
    // Join with symbols to resolve target_symbol_id on-the-fly when NULL
    // Only resolve by name for inherits/implements to avoid fan-out on calls
    const rows = await indexAdapter.allAsync<{ source_symbol_id: number; target_symbol_id: number | null; resolved_id: number | null; kind: string }>(
      `SELECT r.source_symbol_id,
              r.target_symbol_id,
              s.id AS resolved_id,
              r.kind
       FROM relationships r
       LEFT JOIN symbols s ON s.name = r.target_symbol AND s.project_id = r.project_id
       WHERE r.project_id = ?
         AND (
           r.target_symbol_id IS NOT NULL
           OR (r.target_symbol_id IS NULL AND r.kind IN ('inherits','implements') AND s.id IS NOT NULL)
         )`,
      [projectId],
    );
    return rows.map(r => {
      const targetId = r.target_symbol_id ?? r.resolved_id!;
      const label = r.kind.toUpperCase();
      const weight = this.weightForKind(r.kind);
      return {
        source: `code:${r.source_symbol_id}`,
        target: `code:${targetId}`,
        label,
        weight,
      };
    });
  }

  private weightForKind(kind: string): number {
    switch (kind.toLowerCase()) {
      case 'calls': return 0.7;
      case 'inherits': return 0.9;
      case 'implements': return 0.85;
      case 'imports': return 0.8;
      case 'decorates': return 0.6;
      case 'uses': return 0.5;
      default: return 0.5;
    }
  }
}

/** Registry of all code-edge strategies. */
const CODE_EDGE_STRATEGIES: CodeEdgeStrategy[] = [
  new MembershipEdgeStrategy(),
  new FileContainsSymbolStrategy(),
  new RelationshipsEdgeStrategy(),
];

/**
 * Batch-insert extracted code edges into graph_edges (admin DB).
 * Uses ON CONFLICT DO NOTHING for idempotency.
 * Non-fatal: catches all errors to avoid breaking index pipeline.
 */
export async function extractAndInsertCodeEdges(
  indexAdapter: DatabaseAdapter,
  adminAdapter: DatabaseAdapter,
  projectId: string,
  log: Logger,
): Promise<number> {
  let totalInserted = 0;
  for (const strategy of CODE_EDGE_STRATEGIES) {
    try {
      const edges = await strategy.extract(indexAdapter, projectId);
      totalInserted += await batchInsertEdges(adminAdapter, edges);
    } catch (err) {
      // Best-effort: log and continue with next strategy
      log.warn({ err }, `[code-edge-extractor] Strategy ${strategy.constructor.name} failed`);
    }
  }
  return totalInserted;
}

/** Insert edges in batch, ignoring conflicts (idempotent). */
async function batchInsertEdges(adapter: DatabaseAdapter, edges: CodeGraphEdge[]): Promise<number> {
  let count = 0;
  const sql = adapter.getEngine() === 'sqlite'
    ? `INSERT OR IGNORE INTO graph_edges (source, target, weight, rel_type) VALUES (?, ?, ?, ?)`
    : `INSERT INTO graph_edges (source, target, weight, rel_type) VALUES ($1, $2, $3, $4) ON CONFLICT (source, target) DO NOTHING`;
  for (const edge of edges) {
    const result = await adapter.runAsync(sql, [edge.source, edge.target, edge.weight, edge.label]);
    if ((result.changes ?? 0) > 0) count++;
  }
  return count;
}
