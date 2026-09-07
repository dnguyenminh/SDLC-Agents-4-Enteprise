/**
 * SA4E-91 — Edge-on-Ingest: extracts graph edges when KB entries are ingested.
 * Pattern-matches content for entity references (ticket keys, file paths,
 * class names) and creates REFERENCES/DISCUSSES/BELONGS_TO edges.
 * Non-blocking, best-effort: ingest always succeeds even if edge extraction fails.
 */

import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';

/** Context provided when a KB entry is ingested. */
export interface IngestEdgeContext {
  entryId: number;
  content: string;
  source?: string | null;
  tags?: string;
  type?: string;
  projectId?: string | null;
}

/** An edge to be inserted into knowledge_graph_edges. */
export interface IngestGraphEdge {
  sourceId: number;
  targetId: number;
  label: string;
  weight: number;
}

/** Strategy interface for ingest-time edge extraction. */
export interface IngestEdgeStrategy {
  /** Extract edges from the ingest context against existing nodes. */
  extract(ctx: IngestEdgeContext, existingNodes: NodeInfo[]): IngestGraphEdge[];
}

/** Minimal node info for matching references. */
export interface NodeInfo {
  id: number;
  content: string;
  source?: string | null;
  tags?: string;
}

// Patterns for entity detection
const TICKET_KEY_PATTERN = /\b([A-Z][A-Z0-9]+-\d+)\b/g;
const FILE_PATH_PATTERN = /(?:^|\s)([\w./-]+\.\w{1,5})\b/g;
const PASCAL_CASE_PATTERN = /\b([A-Z][a-z]+(?:[A-Z][a-z]+){1,})\b/g;

/** Extracts DISCUSSES edges from ticket key references (e.g. SA4E-91). */
export class TicketRefStrategy implements IngestEdgeStrategy {
  extract(ctx: IngestEdgeContext, existingNodes: NodeInfo[]): IngestGraphEdge[] {
    const matches = [...ctx.content.matchAll(TICKET_KEY_PATTERN)];
    if (matches.length === 0) return [];

    const ticketKeys = new Set(matches.map(m => m[1]));
    const edges: IngestGraphEdge[] = [];

    for (const key of ticketKeys) {
      const matched = existingNodes.find(n => 
        n.content.includes(key) || (n.source && n.source.includes(key)) || (n.tags && n.tags.includes(key))
      );
      if (matched && matched.id !== ctx.entryId) {
        edges.push({ sourceId: ctx.entryId, targetId: matched.id, label: 'DISCUSSES', weight: 0.5 });
      }
    }
    return edges;
  }
}

/** Extracts REFERENCES edges from file path references. */
export class FilePathRefStrategy implements IngestEdgeStrategy {
  extract(ctx: IngestEdgeContext, existingNodes: NodeInfo[]): IngestGraphEdge[] {
    const matches = [...ctx.content.matchAll(FILE_PATH_PATTERN)];
    if (matches.length === 0) return [];

    const paths = new Set(matches.map(m => m[1].trim()));
    const edges: IngestGraphEdge[] = [];

    for (const filePath of paths) {
      const matched = existingNodes.find(n => 
        n.content.includes(filePath) || (n.source && n.source.includes(filePath)) || (n.tags && n.tags.includes(filePath))
      );
      if (matched && matched.id !== ctx.entryId) {
        edges.push({ sourceId: ctx.entryId, targetId: matched.id, label: 'REFERENCES', weight: 0.6 });
      }
    }
    return edges;
  }
}

/** Extracts REFERENCES edges from PascalCase class/type name mentions. */
export class ClassNameRefStrategy implements IngestEdgeStrategy {
  extract(ctx: IngestEdgeContext, existingNodes: NodeInfo[]): IngestGraphEdge[] {
    const matches = [...ctx.content.matchAll(PASCAL_CASE_PATTERN)];
    if (matches.length === 0) return [];

    const names = new Set(matches.map(m => m[1]));
    const edges: IngestGraphEdge[] = [];

    for (const name of names) {
      const matched = existingNodes.find(n => 
        n.content.includes(name) || (n.source && n.source.includes(name)) || (n.tags && n.tags.includes(name))
      );
      if (matched && matched.id !== ctx.entryId) {
        edges.push({ sourceId: ctx.entryId, targetId: matched.id, label: 'REFERENCES', weight: 0.6 });
      }
    }
    return edges;
  }
}

/** Extracts BELONGS_TO edge from source field (links entry to its origin file node). */
export class BelongsToStrategy implements IngestEdgeStrategy {
  extract(ctx: IngestEdgeContext, existingNodes: NodeInfo[]): IngestGraphEdge[] {
    if (!ctx.source) return [];

    const matched = existingNodes.find(n => 
      n.source === ctx.source || n.content.includes(ctx.source!) || (n.tags && n.tags.includes(ctx.source!))
    );
    if (matched && matched.id !== ctx.entryId) {
      return [{ sourceId: ctx.entryId, targetId: matched.id, label: 'BELONGS_TO', weight: 0.6 }];
    }
    return [];
  }
}

/** All ingest-edge strategies (Strategy pattern registry). */
const INGEST_STRATEGIES: IngestEdgeStrategy[] = [
  new TicketRefStrategy(),
  new FilePathRefStrategy(),
  new ClassNameRefStrategy(),
  new BelongsToStrategy(),
];

/**
 * Extract and insert edges after a KB entry is ingested.
 * Queries existing knowledge_entries with project filter & pagination, then batch-inserts edges into knowledge_graph_edges.
 * @returns Number of edges created.
 */
export async function extractAndInsertIngestEdges(
  adapter: DatabaseAdapter,
  ctx: IngestEdgeContext,
): Promise<number> {
  const pageSize = 1000;
  const allEdges: IngestGraphEdge[] = [];
  let offset = 0;
  const engine = adapter.getEngine();

  // Build query with project filter
  const baseWhere = ctx.projectId
    ? `WHERE project_id = ? AND id != ?`
    : `WHERE id != ?`;
  const paramsBase = ctx.projectId ? [ctx.projectId, ctx.entryId] : [ctx.entryId];

  while (true) {
    const sql = engine === 'sqlite'
      ? `SELECT id, content, source, tags FROM knowledge_entries ${baseWhere} ORDER BY id LIMIT ? OFFSET ?`
      : `SELECT id, content, source, tags FROM knowledge_entries ${baseWhere} ORDER BY id LIMIT $1 OFFSET $2`;
    
    const pageParams = engine === 'sqlite'
      ? [...paramsBase, pageSize, offset]
      : [...paramsBase, pageSize, offset];

    const existingNodes = await adapter.allAsync<NodeInfo>(sql, pageParams);
    if (existingNodes.length === 0) break;

    for (const strategy of INGEST_STRATEGIES) {
      const edges = strategy.extract(ctx, existingNodes);
      allEdges.push(...edges);
    }

    offset += pageSize;
    if (existingNodes.length < pageSize) break;
  }

  if (allEdges.length === 0) return 0;
  return batchInsertIngestEdges(adapter, allEdges);
}

/** Insert edges in batch into knowledge_graph_edges with integer IDs. */
async function batchInsertIngestEdges(adapter: DatabaseAdapter, edges: IngestGraphEdge[]): Promise<number> {
  let count = 0;
  const engine = adapter.getEngine();
  // Map edge label to allowed edge_type; fallback to 'reference'
  const mapLabelToType = (label: string): string => {
    const l = label.toUpperCase();
    if (l === 'DISCUSSES' || l === 'BELONGS_TO' || l === 'REFERENCES') return 'reference';
    // fallback for semantic similarity etc.
    return 'reference';
  };
  const sql = engine === 'sqlite'
    ? `INSERT OR IGNORE INTO knowledge_graph_edges (source_id, target_id, relation, weight) VALUES (?, ?, ?, ?)`
    : `INSERT INTO knowledge_graph_edges (source_id, target_id, relation, weight) VALUES ($1, $2, $3, $4) ON CONFLICT (source_id, target_id, relation) DO NOTHING`;

  for (const edge of edges) {
    if (edge.sourceId === edge.targetId) continue;
    const relation = mapLabelToType(edge.label);
    const result = await adapter.runAsync(sql, [edge.sourceId, edge.targetId, relation, edge.weight]);
    if ((result.changes ?? 0) > 0) count++;
  }
  return count;
}
