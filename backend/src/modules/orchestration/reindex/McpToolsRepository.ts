/**
 * SA4E-42 — scoped persistence over `mcp_tools` (Repository).
 * All statements use bound parameters (no interpolation of server/tool values, F-06).
 * Scope-aware upsert refuses to hijack another server's row (F-01); prune falls back
 * to a temp-table anti-join above the bound-variable limit (F-04).
 */
import type Database from 'better-sqlite3';
import type { Logger } from 'pino';
import type { PreparedTool } from './models/PreparedTool.js';

const MAX_PRUNE_VARS = 900;

export class McpToolsRepository {
  constructor(private readonly db: Database.Database, private readonly logger: Logger) {}

  /** Upsert a set of tools scoped to `server` (own transaction). Returns upserted count. */
  upsertScoped(items: PreparedTool[], server: string): number {
    let count = 0;
    const tx = this.db.transaction((list: PreparedTool[]) => {
      for (const it of list) if (this.upsertOne(it, server)) count++;
    });
    tx(items);
    return count;
  }

  /** Delete this server's rows not in `currentNames`; skip on empty set (BR-04/06). */
  pruneRemoved(server: string, currentNames: string[]): number {
    const tx = this.db.transaction(() => this.pruneInTx(server, currentNames));
    return tx();
  }

  /** Remove every row owned by `server` (BR-02/05). Returns deleted count. */
  deleteByServer(server: string): number {
    return this.db.prepare('DELETE FROM mcp_tools WHERE server = ?').run(server).changes;
  }

  /** Atomic connect path: upsert current set + prune removed, in one transaction (IR-5). */
  applyConnected(items: PreparedTool[], server: string): { upserted: number; removed: number } {
    let upserted = 0;
    let removed = 0;
    const tx = this.db.transaction(() => {
      for (const it of items) if (this.upsertOne(it, server)) upserted++;
      removed = this.pruneInTx(server, items.map((i) => i.name));
    });
    tx();
    return { upserted, removed };
  }

  /** Exposed for tests (F-06/UT-19): prune SQL uses only `?` placeholders. */
  buildPruneSql(count: number): string {
    const placeholders = Array.from({ length: count }, () => '?').join(',');
    return `DELETE FROM mcp_tools WHERE server = ? AND name NOT IN (${placeholders})`;
  }

  private upsertOne(it: PreparedTool, server: string): boolean {
    const existing = this.db
      .prepare('SELECT id, server FROM mcp_tools WHERE name = ?')
      .get(it.name) as { id: number; server: string | null } | undefined;
    if (existing && existing.server && existing.server !== server) {
      this.logger.warn(
        { server, tool: it.name, ownedBy: existing.server },
        're-index skipped: tool name already owned by another server (collision)',
      );
      return false;
    }
    if (!existing) this.insertRow(it);
    else this.updateRow(it, existing.id);
    return true;
  }

  private insertRow(it: PreparedTool): void {
    this.db
      .prepare(
        'INSERT INTO mcp_tools (name, description, schema_json, category, server, vector) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(it.name, it.description, it.schemaJson, it.category, it.server, it.vector);
  }

  private updateRow(it: PreparedTool, id: number): void {
    this.db
      .prepare(
        'UPDATE mcp_tools SET description = ?, schema_json = ?, category = ?, server = ?, vector = ? WHERE id = ?',
      )
      .run(it.description, it.schemaJson, it.category, it.server, it.vector, id);
  }

  private pruneInTx(server: string, currentNames: string[]): number {
    if (currentNames.length === 0) {
      this.logger.warn({ server }, 'prune skipped: empty current tool set (no wipe)');
      return 0;
    }
    if (currentNames.length > MAX_PRUNE_VARS) return this.pruneViaTempTable(server, currentNames);
    return this.db.prepare(this.buildPruneSql(currentNames.length)).run(server, ...currentNames).changes;
  }

  private pruneViaTempTable(server: string, currentNames: string[]): number {
    this.db.exec('CREATE TEMP TABLE IF NOT EXISTS _reindex_keep(name TEXT PRIMARY KEY)');
    this.db.prepare('DELETE FROM _reindex_keep').run();
    const ins = this.db.prepare('INSERT OR IGNORE INTO _reindex_keep(name) VALUES (?)');
    for (const n of currentNames) ins.run(n);
    const changes = this.db
      .prepare('DELETE FROM mcp_tools WHERE server = ? AND name NOT IN (SELECT name FROM _reindex_keep)')
      .run(server).changes;
    this.db.prepare('DELETE FROM _reindex_keep').run();
    return changes;
  }
}
