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
    const params = [
      entry.content, entry.summary, entry.type,
      entry.tier ?? 'WORKING', entry.scope ?? 'USER',
      entry.user_id ?? null,
      entry.project_id ?? null,
      entry.source ?? null,
      entry.source_ref ?? null, entry.tags ?? '',
      entry.confidence ?? 1.0, entry.agent_name ?? null,
      entry.owner ?? null,
    ];
    let id: number;

    // SA4E-FIX: Use upsert when source is non-null to avoid duplicate key violation
    // on idx_ke_source_project_unique (source, project_id)
    const hasSource = entry.source != null && entry.source.length > 0;
    if (engine === 'postgresql') {
      if (hasSource) {
        const row = await this.adapter.getAsync<{ id: number }>(`
          INSERT INTO knowledge_entries
          (content, summary, type, tier, scope, user_id, project_id, source, source_ref, tags, confidence, agent_name, owner)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          ON CONFLICT (source, project_id) WHERE source IS NOT NULL DO UPDATE SET
            content = EXCLUDED.content,
            summary = EXCLUDED.summary,
            type = EXCLUDED.type,
            tier = EXCLUDED.tier,
            scope = EXCLUDED.scope,
            tags = EXCLUDED.tags,
            confidence = EXCLUDED.confidence,
            agent_name = EXCLUDED.agent_name,
            owner = EXCLUDED.owner,
            updated_at = NOW()
          RETURNING id
        `, params);
        id = row?.id ?? 0;
      } else {
        const row = await this.adapter.getAsync<{ id: number }>(`
          INSERT INTO knowledge_entries
          (content, summary, type, tier, scope, user_id, project_id, source, source_ref, tags, confidence, agent_name, owner)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          RETURNING id
        `, params);
        id = row?.id ?? 0;
      }
    } else {
      if (hasSource) {
        // SQLite: check-then-update/insert pattern for upsert
        const existing = await this.adapter.getAsync<{ id: number }>(
          `SELECT id FROM knowledge_entries WHERE source = ? AND project_id = ?`,
          [entry.source, entry.project_id ?? null],
        );
        if (existing) {
          await this.adapter.runAsync(`
            UPDATE knowledge_entries SET
              content = ?, summary = ?, type = ?, tier = ?, scope = ?,
              tags = ?, confidence = ?, agent_name = ?, owner = ?, updated_at = datetime('now')
            WHERE id = ?
          `, [entry.content, entry.summary, entry.type, entry.tier ?? 'WORKING', entry.scope ?? 'USER',
              entry.tags ?? '', entry.confidence ?? 1.0, entry.agent_name ?? null, entry.owner ?? null,
              existing.id]);
          id = existing.id;
        } else {
          const result = await this.adapter.runAsync(`
            INSERT INTO knowledge_entries
            (content, summary, type, tier, scope, user_id, project_id, source, source_ref, tags, confidence, agent_name, owner)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, params);
          id = result.lastInsertRowid as number;
        }
      } else {
        const result = await this.adapter.runAsync(`
          INSERT INTO knowledge_entries
          (content, summary, type, tier, scope, user_id, project_id, source, source_ref, tags, confidence, agent_name, owner)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, params);
        id = result.lastInsertRowid as number;
      }
    }

    return id;
  }

  /**
   * Remove orphan graph nodes whose source entities no longer exist.
   * Also removes ALL legacy 'kb-entry:*' nodes (replaced by 'doc-{id}' format).
   * Ensures graph_nodes stays consistent with source tables over time.
   * Runs on startup (non-fatal).
   */
  async reconcileOrphanGraphNodes(): Promise<number> {
    try {
      // Remove ALL legacy 'kb-entry:*' nodes — this prefix is no longer used
      const r1 = await this.adapter.runAsync(
        `DELETE FROM graph_nodes WHERE entry_id LIKE 'kb-entry:%'`,
      );
      // Clean orphan 'doc-*' nodes (KB entries that were deleted)
      const r2 = await this.adapter.runAsync(
        `DELETE FROM graph_nodes WHERE entry_id LIKE 'doc-%'
         AND CAST(REPLACE(entry_id, 'doc-', '') AS INTEGER) NOT IN (
           SELECT id FROM knowledge_entries
         )`,
      );
      // Clean orphan 'sym-*' nodes (symbols that were deleted)
      const r3 = await this.adapter.runAsync(
        `DELETE FROM graph_nodes WHERE entry_id LIKE 'sym-%'
         AND CAST(REPLACE(entry_id, 'sym-', '') AS INTEGER) NOT IN (
           SELECT id FROM symbols
         )`,
      );
      // Clean orphan 'code:*' nodes (symbols re-created with a new id on re-index).
      // Without this, a graph node points at a dead symbol id and the viewer
      // shows "No content available" even though the live symbol is enriched.
      const r4 = await this.adapter.runAsync(
        `DELETE FROM graph_nodes WHERE entry_id LIKE 'code:%'
         AND CAST(REPLACE(entry_id, 'code:', '') AS INTEGER) NOT IN (
           SELECT id FROM symbols
         )`,
      );
      return (r1.changes ?? 0) + (r2.changes ?? 0) + (r3.changes ?? 0) + (r4.changes ?? 0);
    } catch {
      // Non-fatal: graph_nodes table may not exist in test environments
      return 0;
    }
  }

  async findById(id: number): Promise<KnowledgeEntry | undefined> {
    return this.adapter.getAsync<KnowledgeEntry>('SELECT * FROM knowledge_entries WHERE id = ?', [id]);
  }

  async deleteEntry(id: number): Promise<void> {
    // Delete FK-dependent records first (CASCADE may not work in all SQLite configurations)
    try { await this.adapter.runAsync('DELETE FROM knowledge_vectors WHERE entry_id = ?', [id]); } catch { /* non-fatal */ }
    try { await this.adapter.runAsync('DELETE FROM knowledge_graph_edges WHERE source_id = ? OR target_id = ?', [id, id]); } catch { /* non-fatal */ }
    try { await this.adapter.runAsync('DELETE FROM consolidation_log WHERE entry_id = ?', [id]); } catch { /* non-fatal */ }
    try { await this.adapter.runAsync('DELETE FROM citations WHERE entry_id = ?', [id]); } catch { /* non-fatal */ }
    try { await this.adapter.runAsync('DELETE FROM entry_quality_scores WHERE entry_id = ?', [id]); } catch { /* non-fatal */ }
    try { await this.adapter.runAsync('DELETE FROM pending_tasks WHERE entry_id = ?', [id]); } catch { /* non-fatal */ }
    try { await this.adapter.runAsync('DELETE FROM entry_outcomes WHERE entry_id = ?', [id]); } catch { /* non-fatal */ }
    try { await this.adapter.runAsync('DELETE FROM scope_promotion_log WHERE entry_id = ?', [id]); } catch { /* non-fatal */ }
    try { await this.adapter.runAsync('DELETE FROM contradiction_log WHERE entry_id_a = ? OR entry_id_b = ?', [id, id]); } catch { /* non-fatal */ }
    await this.adapter.runAsync('DELETE FROM knowledge_entries WHERE id = ?', [id]);
    // Cascade: remove corresponding graph node (same unified DB — SA4E-49)
    try {
      await this.adapter.runAsync(`DELETE FROM graph_nodes WHERE entry_id = ?`, [`doc-${id}`]);
    } catch {
      // Non-fatal: graph_nodes table may not exist in test environments
    }
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
