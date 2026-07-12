import * as fs from 'fs';
import Database from 'better-sqlite3';
import { getIndexDbPath, logger } from './core.js';

export function getAllKbTags(): Record<string, { count: number; lastUsed: string }> {
  const tagCounts: Record<string, { count: number; lastUsed: string }> = {};
  try {
    const indexDbPath = getIndexDbPath();
    if (!fs.existsSync(indexDbPath)) return tagCounts;
    const indexDb = new Database(indexDbPath, { readonly: true });

    const tableExists = indexDb.prepare("SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='knowledge_entries'").get() as { cnt: number } | undefined;
    if (tableExists && tableExists.cnt > 0) {
      const rows = indexDb.prepare("SELECT tags, created_at FROM knowledge_entries WHERE tags IS NOT NULL AND tags != ''").all() as { tags: string; created_at: string }[];
      for (const row of rows) {
        if (!row.tags) continue;
        const tags = row.tags.split(',').map((t: string) => t.trim()).filter((t: string) => t.length > 0);
        for (const tag of tags) {
          if (!tagCounts[tag]) {
            tagCounts[tag] = { count: 0, lastUsed: row.created_at || new Date().toISOString() };
          }
          tagCounts[tag].count++;
          if (row.created_at && new Date(row.created_at) > new Date(tagCounts[tag].lastUsed)) {
            tagCounts[tag].lastUsed = row.created_at;
          }
        }
      }
    }
    indexDb.close();
  } catch (e) {
    logger.error({ err: e }, 'Error in getAllKbTags:');
  }
  return tagCounts;
}

export function updateKbEntryTags(entryId: string, tags: string[]): void {
  try {
    const indexDbPath = getIndexDbPath();
    if (!fs.existsSync(indexDbPath)) return;
    const indexDb = new Database(indexDbPath);

    const tableExists = indexDb.prepare("SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='knowledge_entries'").get() as { cnt: number } | undefined;
    if (tableExists && tableExists.cnt > 0) {
      const tagsStr = tags.join(',');
      indexDb.prepare('UPDATE knowledge_entries SET tags = ? WHERE id = ?').run(tagsStr, entryId);
    }
    indexDb.close();
  } catch (e) {
    logger.error({ err: e }, 'Error in updateKbEntryTags:');
  }
}

export function renameKbTag(oldName: string, newName: string): number {
  let renamed = 0;
  try {
    const indexDbPath = getIndexDbPath();
    if (!fs.existsSync(indexDbPath)) return 0;
    const indexDb = new Database(indexDbPath);
    const tableExists = indexDb.prepare("SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='knowledge_entries'").get() as { cnt: number } | undefined;
    if (tableExists && tableExists.cnt > 0) {
      const rows = indexDb.prepare('SELECT id, tags FROM knowledge_entries WHERE tags LIKE ?').all(`%${oldName}%`) as { id: string; tags: string }[];
      const updateStmt = indexDb.prepare('UPDATE knowledge_entries SET tags = ? WHERE id = ?');
      for (const row of rows) {
        if (!row.tags) continue;
        const tagArr = row.tags.split(',').map((t: string) => t.trim()).filter((t: string) => t.length > 0);
        const idx = tagArr.indexOf(oldName);
        if (idx !== -1) {
          tagArr[idx] = newName.trim();
          updateStmt.run(tagArr.join(','), row.id);
          renamed++;
        }
      }
    }
    indexDb.close();
  } catch (e) {
    logger.error({ err: e }, 'Error in renameKbTag:');
  }
  return renamed;
}

export function deleteKbTag(tagName: string): number {
  let removed = 0;
  try {
    const indexDbPath = getIndexDbPath();
    if (!fs.existsSync(indexDbPath)) return 0;
    const indexDb = new Database(indexDbPath);
    const tableExists = indexDb.prepare("SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='knowledge_entries'").get() as { cnt: number } | undefined;
    if (tableExists && tableExists.cnt > 0) {
      const rows = indexDb.prepare('SELECT id, tags FROM knowledge_entries WHERE tags LIKE ?').all(`%${tagName}%`) as { id: string; tags: string }[];
      const updateStmt = indexDb.prepare('UPDATE knowledge_entries SET tags = ? WHERE id = ?');
      for (const row of rows) {
        if (!row.tags) continue;
        const tagArr = row.tags.split(',').map((t: string) => t.trim()).filter((t: string) => t.length > 0);
        const idx = tagArr.indexOf(tagName);
        if (idx !== -1) {
          tagArr.splice(idx, 1);
          updateStmt.run(tagArr.join(','), row.id);
          removed++;
        }
      }
    }
    indexDb.close();
  } catch (e) {
    logger.error({ err: e }, 'Error in deleteKbTag:');
  }
  return removed;
}

export function mergeKbTags(sourceTag: string, targetTag: string): number {
  let merged = 0;
  try {
    const indexDbPath = getIndexDbPath();
    if (!fs.existsSync(indexDbPath)) return 0;
    const indexDb = new Database(indexDbPath);
    const tableExists = indexDb.prepare("SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='knowledge_entries'").get() as { cnt: number } | undefined;
    if (tableExists && tableExists.cnt > 0) {
      const rows = indexDb.prepare('SELECT id, tags FROM knowledge_entries WHERE tags LIKE ?').all(`%${sourceTag}%`) as { id: string; tags: string }[];
      const updateStmt = indexDb.prepare('UPDATE knowledge_entries SET tags = ? WHERE id = ?');
      for (const row of rows) {
        if (!row.tags) continue;
        const tagArr = row.tags.split(',').map((t: string) => t.trim()).filter((t: string) => t.length > 0);
        const idx = tagArr.indexOf(sourceTag);
        if (idx !== -1) {
          tagArr.splice(idx, 1);
          if (!tagArr.includes(targetTag)) {
            tagArr.push(targetTag);
          }
          updateStmt.run(tagArr.join(','), row.id);
          merged++;
        }
      }
    }
    indexDb.close();
  } catch (e) {
    logger.error({ err: e }, 'Error in mergeKbTags:');
  }
  return merged;
}

export function getKbEntriesByTag(tagName: string, projectId?: string): any[] {
  const entries: any[] = [];
  try {
    const indexDbPath = getIndexDbPath();
    if (!fs.existsSync(indexDbPath)) return entries;
    const indexDb = new Database(indexDbPath, { readonly: true });
    const tableExists = indexDb.prepare("SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='knowledge_entries'").get() as { cnt: number } | undefined;
    if (tableExists && tableExists.cnt > 0) {
      let rows: Record<string, unknown>[];
      if (projectId && projectId !== 'default') {
        rows = indexDb.prepare("SELECT * FROM knowledge_entries WHERE tags LIKE ? AND (scope = 'SHARED' OR (scope = 'PROJECT' AND (project_id = ? OR project_id IS NULL)) OR scope = 'USER')").all(`%${tagName}%`, projectId) as Record<string, unknown>[];
      } else {
        rows = indexDb.prepare('SELECT * FROM knowledge_entries WHERE tags LIKE ?').all(`%${tagName}%`) as Record<string, unknown>[];
      }
      for (const row of rows) {
        if (!row.tags) continue;
        const tagArr = row.tags.split(',').map((t: string) => t.trim());
        if (tagArr.includes(tagName)) {
          entries.push(row);
        }
      }
    }
    indexDb.close();
  } catch (e) {
    logger.error({ err: e }, 'Error in getKbEntriesByTag:');
  }
  return entries;
}
