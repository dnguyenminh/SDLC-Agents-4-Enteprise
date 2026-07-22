/**
 * MemoryEngine Crud Base — core CRUD + graph operations.
 * SA4E-53: converted to async API for PostgreSQL compatibility.
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

  /** SA4E-53: Public accessor for async DB operations. */
  getAdapter(): DatabaseAdapter { return this.adapter; }

  /** SA4E-53: Public accessor for dialect helper. */
  getDialect(): DialectHelper { return this.dialect; }

  /** SA4E-47: Update structured_map JSON column for an entry. SA4E-53: async. */
  async updateStructuredMap(id: number, structuredMap: string): Promise<void> {
    await this.adapter.runAsync(
      `UPDATE knowledge_entries SET structured_map = ?, updated_at = ${this.dialect.now()} WHERE id = ?`,
      [structuredMap, id],
    );
  }

  async insert(entry: Partial<KnowledgeEntry> & { project_id?: string | null }): Promise<number> {
    const engine = this.adapter.getEngine();
    if (engine === 'postgresql') {
      // PostgreSQL requires RETURNING id to get the inserted row ID
      const row = await this.adapter.getAsync<{ id: number }>(`
        INSERT INTO knowledge_entries
        (content, summary, type, tier, scope, user_id, project_id, source, source_ref, tags, confidence, agent_name, owner)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING id
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
      return row?.id ?? 0;
    }
    const result = await this.adapter.runAsync(`
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

  async findById(id: number): Promise<KnowledgeEntry | undefined> {
    return this.adapter.getAsync<KnowledgeEntry>('SELECT * FROM knowledge_entries WHERE id = ?', [id]);
  }

  async deleteEntry(id: number): Promise<void> {
    await this.adapter.runAsync('DELETE FROM knowledge_entries WHERE id = ?', [id]);
  }

  async updateTags(id: number, tags: string): Promise<void> {
    await this.adapter.runAsync(
      `UPDATE knowledge_entries SET tags = ?, updated_at = ${this.dialect.now()} WHERE id = ?`,
      [tags, id],
    );
  }

  async recordAccess(id: number): Promise<void> {
    await this.adapter.runAsync(`
      UPDATE knowledge_entries
      SET access_count = access_count + 1, last_accessed_at = ${this.dialect.now()}
      WHERE id = ?
    `, [id]);
  }

  async addEdge(sourceId: number, targetId: number, relation = 'RELATES_TO', weight = 1.0): Promise<number> {
    const result = await this.adapter.runAsync(
      `INSERT INTO knowledge_graph_edges (source_id, target_id, relation, weight) VALUES (?, ?, ?, ?)`,
      [sourceId, targetId, relation, weight],
    );
    return result.lastInsertRowid as number;
  }

  async getNeighbors(nodeId: number): Promise<GraphEdge[]> {
    return this.adapter.allAsync<GraphEdge>(
      'SELECT * FROM knowledge_graph_edges WHERE source_id = ? OR target_id = ?',
      [nodeId, nodeId],
    );
  }

  async countEdges(): Promise<number> {
    const row = await this.adapter.getAsync<{ cnt: number }>('SELECT COUNT(*) as cnt FROM knowledge_graph_edges');
    return row?.cnt ?? 0;
  }
}
