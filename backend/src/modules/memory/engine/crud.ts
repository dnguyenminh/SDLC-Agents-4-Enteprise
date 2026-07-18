/**
 * MemoryEngine Crud Base — core CRUD + graph operations.
 */

import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import { DialectHelper } from '../../../database/dialect/DialectHelper.js';
import type { KnowledgeEntry, GraphEdge } from '../models.js';

export class MemoryEngineCrud {
  protected readonly adapter: DatabaseAdapter;
  protected readonly dialect: DialectHelper;

  constructor(adapter: DatabaseAdapter) {
    this.adapter = adapter;
    this.dialect = new DialectHelper(adapter.getEngine());
  }

  /** @deprecated Use adapter directly. Removed in SA4E-47. */
  getDb(): unknown { return (this.adapter as any).db ?? this.adapter; }

  /** SA4E-47: Update structured_map JSON column for an entry. */
  updateStructuredMap(id: number, structuredMap: string): void {
    this.adapter.run(
      `UPDATE knowledge_entries SET structured_map = ?, updated_at = ${this.dialect.now()} WHERE id = ?`,
      [structuredMap, id],
    );
  }

  insert(entry: Partial<KnowledgeEntry> & { project_id?: string | null }): number {
    const result = this.adapter.run(`
      INSERT INTO knowledge_entries
      (content, summary, type, tier, scope, user_id, project_id, source, source_ref, tags, confidence, agent_name, owner)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      entry.content, entry.summary, entry.type,
      entry.tier ?? 'WORKING', entry.scope ?? 'USER',
      entry.user_id ?? null,
      entry.project_id ?? null,
      entry.source ?? null,
      entry.source_ref ?? null, entry.tags ?? '',
      entry.confidence ?? 1.0, entry.agent_name ?? null,
      entry.owner ?? null,
    ]);
    return result.lastInsertRowid as number;
  }

  findById(id: number): KnowledgeEntry | undefined {
    return this.adapter.get<KnowledgeEntry>('SELECT * FROM knowledge_entries WHERE id = ?', [id]);
  }

  deleteEntry(id: number): void {
    this.adapter.run('DELETE FROM knowledge_entries WHERE id = ?', [id]);
  }

  updateTags(id: number, tags: string): void {
    this.adapter.run(
      `UPDATE knowledge_entries SET tags = ?, updated_at = ${this.dialect.now()} WHERE id = ?`,
      [tags, id],
    );
  }

  recordAccess(id: number): void {
    this.adapter.run(`
      UPDATE knowledge_entries
      SET access_count = access_count + 1, last_accessed_at = ${this.dialect.now()}
      WHERE id = ?
    `, [id]);
  }

  addEdge(sourceId: number, targetId: number, relation = 'RELATES_TO', weight = 1.0): number {
    const result = this.adapter.run(
      `INSERT INTO knowledge_graph_edges (source_id, target_id, relation, weight) VALUES (?, ?, ?, ?)`,
      [sourceId, targetId, relation, weight],
    );
    return result.lastInsertRowid as number;
  }

  getNeighbors(nodeId: number): GraphEdge[] {
    return this.adapter.all<GraphEdge>(
      'SELECT * FROM knowledge_graph_edges WHERE source_id = ? OR target_id = ?',
      [nodeId, nodeId],
    );
  }

  countEdges(): number {
    const row = this.adapter.get<{ cnt: number }>('SELECT COUNT(*) as cnt FROM knowledge_graph_edges');
    return row?.cnt ?? 0;
  }
}
