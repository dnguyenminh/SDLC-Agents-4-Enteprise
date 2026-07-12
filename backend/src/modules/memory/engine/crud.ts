/**
 * MemoryEngine Crud Base — core CRUD + graph operations.
 */

import Database from 'better-sqlite3';
import type { KnowledgeEntry, SearchResult, GraphEdge } from '../models.js';

export class MemoryEngineCrud {
  protected readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  getDb(): Database.Database { return this.db; }

  insert(entry: Partial<KnowledgeEntry> & { project_id?: string | null }): number {
    const stmt = this.db.prepare(`
      INSERT INTO knowledge_entries
      (content, summary, type, tier, scope, user_id, project_id, source, source_ref, tags, confidence, agent_name, owner)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      entry.content, entry.summary, entry.type,
      entry.tier ?? 'WORKING', entry.scope ?? 'USER',
      entry.user_id ?? null,
      entry.project_id ?? null,
      entry.source ?? null,
      entry.source_ref ?? null, entry.tags ?? '',
      entry.confidence ?? 1.0, entry.agent_name ?? null,
      entry.owner ?? null,
    );
    return result.lastInsertRowid as number;
  }

  findById(id: number): KnowledgeEntry | undefined {
    return this.db.prepare('SELECT * FROM knowledge_entries WHERE id = ?')
      .get(id) as KnowledgeEntry | undefined;
  }

  deleteEntry(id: number): void {
    this.db.prepare('DELETE FROM knowledge_entries WHERE id = ?').run(id);
  }

  updateTags(id: number, tags: string): void {
    this.db.prepare('UPDATE knowledge_entries SET tags = ?, updated_at = datetime(\'now\') WHERE id = ?').run(tags, id);
  }

  recordAccess(id: number): void {
    this.db.prepare(`
      UPDATE knowledge_entries
      SET access_count = access_count + 1, last_accessed_at = datetime('now')
      WHERE id = ?
    `).run(id);
  }

  addEdge(sourceId: number, targetId: number, relation = 'RELATES_TO', weight = 1.0): number {
    const result = this.db.prepare(
      `INSERT INTO knowledge_graph_edges (source_id, target_id, relation, weight) VALUES (?, ?, ?, ?)`
    ).run(sourceId, targetId, relation, weight);
    return result.lastInsertRowid as number;
  }

  getNeighbors(nodeId: number): GraphEdge[] {
    return this.db.prepare(
      'SELECT * FROM knowledge_graph_edges WHERE source_id = ? OR target_id = ?'
    ).all(nodeId, nodeId) as GraphEdge[];
  }

  countEdges(): number {
    return (this.db.prepare('SELECT COUNT(*) as cnt FROM knowledge_graph_edges').get() as any).cnt;
  }
}
