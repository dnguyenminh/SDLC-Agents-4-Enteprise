import * as fs from 'fs';
import Database from 'better-sqlite3';
import { getIndexDbPath } from './core.js';
import { buildAdminScopeFilter } from './kb-scope-filter.js';

export function getKbEntryById(entryId: string): any | null {
  try {
    const indexDbPath = getIndexDbPath();
    if (!fs.existsSync(indexDbPath)) return null;
    const indexDb = new Database(indexDbPath, { readonly: true });

    const tableExists = indexDb.prepare("SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='knowledge_entries'").get() as { cnt: number } | undefined;
    if (!tableExists || tableExists.cnt === 0) {
      indexDb.close();
      return null;
    }

    const row = indexDb.prepare('SELECT * FROM knowledge_entries WHERE id = ?').get(entryId) as Record<string, unknown> | undefined;
    indexDb.close();
    return row || null;
  } catch {
    return null;
  }
}

export function getKbEntryCount(projectId?: string, userId?: string): number {
  try {
    const indexDbPath = getIndexDbPath();
    if (!fs.existsSync(indexDbPath)) return 0;
    const indexDb = new Database(indexDbPath, { readonly: true });
    const result = indexDb.prepare("SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='knowledge_entries'").get() as { cnt: number } | undefined;
    if (!result || result.cnt === 0) {
      indexDb.close();
      return 0;
    }
    const filter = buildAdminScopeFilter(projectId, userId);
    let count: number;
    if (filter) {
      count = (indexDb.prepare(`SELECT COUNT(*) as cnt FROM knowledge_entries WHERE ${filter.clause}`).get(...filter.params) as { cnt: number }).cnt;
    } else {
      count = (indexDb.prepare('SELECT COUNT(*) as cnt FROM knowledge_entries').get() as { cnt: number }).cnt;
    }
    indexDb.close();
    return count;
  } catch {
    return 0;
  }
}

export function getKbEntries(page = 1, pageSize = 20, sortBy = 'created_at', sortDir: 'asc' | 'desc' = 'desc', projectId?: string, userId?: string): { items: any[]; total: number } {
  try {
    const indexDbPath = getIndexDbPath();
    if (!fs.existsSync(indexDbPath)) return { items: [], total: 0 };
    const indexDb = new Database(indexDbPath, { readonly: true });

    const tableExists = indexDb.prepare("SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='knowledge_entries'").get() as { cnt: number } | undefined;
    if (!tableExists || tableExists.cnt === 0) {
      indexDb.close();
      return { items: [], total: 0 };
    }

    const columns = indexDb.prepare("PRAGMA table_info(knowledge_entries)").all() as { name: string }[];
    const validColumns = columns.map((c: { name: string }) => c.name);
    const safeSort = validColumns.includes(sortBy) ? sortBy : 'created_at';
    const safeDir = sortDir === 'asc' ? 'ASC' : 'DESC';

    const filter = buildAdminScopeFilter(projectId, userId);
    let total: number;
    let rows: Record<string, unknown>[];
    if (filter) {
      const whereClause = `WHERE ${filter.clause}`;
      total = (indexDb.prepare(`SELECT COUNT(*) as cnt FROM knowledge_entries ${whereClause}`).get(...filter.params) as { cnt: number }).cnt;
      rows = indexDb.prepare(`SELECT * FROM knowledge_entries ${whereClause} ORDER BY ${safeSort} ${safeDir} LIMIT ? OFFSET ?`).all(...filter.params, pageSize, (page - 1) * pageSize) as Record<string, unknown>[];
    } else {
      total = (indexDb.prepare('SELECT COUNT(*) as cnt FROM knowledge_entries').get() as { cnt: number }).cnt;
      rows = indexDb.prepare(`SELECT * FROM knowledge_entries ORDER BY ${safeSort} ${safeDir} LIMIT ? OFFSET ?`).all(pageSize, (page - 1) * pageSize) as Record<string, unknown>[];
    }

    indexDb.close();
    return { items: rows, total };
  } catch {
    return { items: [], total: 0 };
  }
}
