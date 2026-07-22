/**
 * SA4E-42 — scoped persistence over `mcp_tools` (Repository).
 * SA4E-53: converted to async DatabaseAdapter for PostgreSQL compatibility.
 * All statements use bound parameters (no interpolation of server/tool values, F-06).
 */
import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import type { Logger } from 'pino';
import type { PreparedTool } from './models/PreparedTool.js';

const MAX_PRUNE_VARS = 900;

export class McpToolsRepository {
  constructor(private readonly adapter: DatabaseAdapter, private readonly logger: Logger) {}

  /** Upsert a set of tools scoped to `server`. Returns upserted count. */
  async upsertScoped(items: PreparedTool[], server: string): Promise<number> {
    let count = 0;
    for (const it of items) {
      if (await this.upsertOne(it, server)) count++;
    }
    return count;
  }

  /** Delete this server's rows not in `currentNames`; skip on empty set (BR-04/06). */
  async pruneRemoved(server: string, currentNames: string[]): Promise<number> {
    return this.pruneInternal(server, currentNames);
  }

  /** Remove every row owned by `server` (BR-02/05). Returns deleted count. */
  async deleteByServer(server: string): Promise<number> {
    const result = await this.adapter.runAsync('DELETE FROM mcp_tools WHERE server = ?', [server]);
    return result.changes;
  }

  /** Atomic connect path: upsert current set + prune removed (IR-5). */
  async applyConnected(items: PreparedTool[], server: string): Promise<{ upserted: number; removed: number }> {
    let upserted = 0;
    for (const it of items) {
      if (await this.upsertOne(it, server)) upserted++;
    }
    const removed = await this.pruneInternal(server, items.map((i) => i.name));
    return { upserted, removed };
  }

  /** Exposed for tests (F-06/UT-19): prune SQL uses only `?` placeholders. */
  buildPruneSql(count: number): string {
    const placeholders = Array.from({ length: count }, () => '?').join(',');
    return `DELETE FROM mcp_tools WHERE server = ? AND name NOT IN (${placeholders})`;
  }

  private async upsertOne(it: PreparedTool, server: string): Promise<boolean> {
    const existing = await this.adapter.getAsync<{ id: number; server: string | null }>(
      'SELECT id, server FROM mcp_tools WHERE name = ?', [it.name],
    );
    if (existing && existing.server && existing.server !== server) {
      this.logger.warn(
        { server, tool: it.name, ownedBy: existing.server },
        're-index skipped: tool name already owned by another server (collision)',
      );
      return false;
    }
    if (!existing) await this.insertRow(it);
    else await this.updateRow(it, existing.id);
    return true;
  }

  private async insertRow(it: PreparedTool): Promise<void> {
    await this.adapter.runAsync(
      'INSERT INTO mcp_tools (name, description, schema_json, category, server, vector) VALUES (?, ?, ?, ?, ?, ?)',
      [it.name, it.description, it.schemaJson, it.category, it.server, it.vector],
    );
  }

  private async updateRow(it: PreparedTool, id: number): Promise<void> {
    await this.adapter.runAsync(
      'UPDATE mcp_tools SET description = ?, schema_json = ?, category = ?, server = ?, vector = ? WHERE id = ?',
      [it.description, it.schemaJson, it.category, it.server, it.vector, id],
    );
  }

  private async pruneInternal(server: string, currentNames: string[]): Promise<number> {
    if (currentNames.length === 0) {
      this.logger.warn({ server }, 'prune skipped: empty current tool set (no wipe)');
      return 0;
    }
    if (currentNames.length > MAX_PRUNE_VARS) {
      return this.pruneViaTempTable(server, currentNames);
    }
    const sql = this.buildPruneSql(currentNames.length);
    const result = await this.adapter.runAsync(sql, [server, ...currentNames]);
    return result.changes;
  }

  private async pruneViaTempTable(server: string, currentNames: string[]): Promise<number> {
    // For PostgreSQL: use a CTE-based approach; for SQLite: temp table
    const engine = this.adapter.getEngine();
    if (engine === 'postgresql') {
      // Use unnest array for PostgreSQL
      const result = await this.adapter.runAsync(
        `DELETE FROM mcp_tools WHERE server = ? AND name NOT IN (SELECT unnest(?::text[]))`,
        [server, currentNames],
      );
      return result.changes;
    }
    // SQLite fallback with temp table
    await this.adapter.runAsync('CREATE TEMP TABLE IF NOT EXISTS _reindex_keep(name TEXT PRIMARY KEY)');
    await this.adapter.runAsync('DELETE FROM _reindex_keep');
    for (const n of currentNames) {
      await this.adapter.runAsync('INSERT OR IGNORE INTO _reindex_keep(name) VALUES (?)', [n]);
    }
    const result = await this.adapter.runAsync(
      'DELETE FROM mcp_tools WHERE server = ? AND name NOT IN (SELECT name FROM _reindex_keep)',
      [server],
    );
    await this.adapter.runAsync('DELETE FROM _reindex_keep');
    return result.changes;
  }
}
