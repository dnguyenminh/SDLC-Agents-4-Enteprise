/**
 * admin/db/kb-tags.ts — KB tag management via DatabaseAdapter.
 * SA4E-45: Uses getIndexAdapter() for multi-DB support.
 */

import { getIndexAdapter, getActiveEngine, logger } from './core.js';
import { buildAdminScopeFilter } from './kb-scope-filter.js';

/** Check if knowledge_entries table exists */
function tableExists(): boolean {
  const adapter = getIndexAdapter();
  if (getActiveEngine() === 'sqlite') {
    const row = adapter.get<{ cnt: number }>(
      "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='knowledge_entries'"
    );
    return (row?.cnt ?? 0) > 0;
  }
  return true;
}

export function getAllKbTags(
  projectId?: string, userId?: string
): Record<string, { count: number; lastUsed: string }> {
  const tagCounts: Record<string, { count: number; lastUsed: string }> = {};
  try {
    if (!tableExists()) return tagCounts;
    const adapter = getIndexAdapter();
    const filter = buildAdminScopeFilter(projectId, userId);
    let rows: { tags: string; created_at: string }[];
    if (filter) {
      rows = adapter.all<{ tags: string; created_at: string }>(
        `SELECT tags, created_at FROM knowledge_entries WHERE tags IS NOT NULL AND tags != '' AND (${filter.clause})`,
        filter.params as unknown[]
      );
    } else {
      rows = adapter.all<{ tags: string; created_at: string }>(
        "SELECT tags, created_at FROM knowledge_entries WHERE tags IS NOT NULL AND tags != ''"
      );
    }
    for (const row of rows) {
      if (!row.tags) continue;
      const tags = row.tags.split(',').map((t) => t.trim()).filter((t) => t.length > 0);
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
  } catch (e) {
    logger.error({ err: e }, 'Error in getAllKbTags:');
  }
  return tagCounts;
}

export function updateKbEntryTags(entryId: string, tags: string[]): void {
  try {
    if (!tableExists()) return;
    const adapter = getIndexAdapter();
    const tagsStr = tags.join(',');
    adapter.run('UPDATE knowledge_entries SET tags = ? WHERE id = ?', [tagsStr, entryId]);
  } catch (e) {
    logger.error({ err: e }, 'Error in updateKbEntryTags:');
  }
}

export function renameKbTag(oldName: string, newName: string): number {
  let renamed = 0;
  try {
    if (!tableExists()) return 0;
    const adapter = getIndexAdapter();
    const rows = adapter.all<{ id: string; tags: string }>(
      'SELECT id, tags FROM knowledge_entries WHERE tags LIKE ?',
      [`%${oldName}%`]
    );
    for (const row of rows) {
      if (!row.tags) continue;
      const tagArr = row.tags.split(',').map((t) => t.trim()).filter((t) => t.length > 0);
      const idx = tagArr.indexOf(oldName);
      if (idx !== -1) {
        tagArr[idx] = newName.trim();
        adapter.run('UPDATE knowledge_entries SET tags = ? WHERE id = ?', [tagArr.join(','), row.id]);
        renamed++;
      }
    }
  } catch (e) {
    logger.error({ err: e }, 'Error in renameKbTag:');
  }
  return renamed;
}

export function deleteKbTag(tagName: string): number {
  let removed = 0;
  try {
    if (!tableExists()) return 0;
    const adapter = getIndexAdapter();
    const rows = adapter.all<{ id: string; tags: string }>(
      'SELECT id, tags FROM knowledge_entries WHERE tags LIKE ?',
      [`%${tagName}%`]
    );
    for (const row of rows) {
      if (!row.tags) continue;
      const tagArr = row.tags.split(',').map((t) => t.trim()).filter((t) => t.length > 0);
      const idx = tagArr.indexOf(tagName);
      if (idx !== -1) {
        tagArr.splice(idx, 1);
        adapter.run('UPDATE knowledge_entries SET tags = ? WHERE id = ?', [tagArr.join(','), row.id]);
        removed++;
      }
    }
  } catch (e) {
    logger.error({ err: e }, 'Error in deleteKbTag:');
  }
  return removed;
}

export function mergeKbTags(sourceTag: string, targetTag: string): number {
  let merged = 0;
  try {
    if (!tableExists()) return 0;
    const adapter = getIndexAdapter();
    const rows = adapter.all<{ id: string; tags: string }>(
      'SELECT id, tags FROM knowledge_entries WHERE tags LIKE ?',
      [`%${sourceTag}%`]
    );
    for (const row of rows) {
      if (!row.tags) continue;
      const tagArr = row.tags.split(',').map((t) => t.trim()).filter((t) => t.length > 0);
      const idx = tagArr.indexOf(sourceTag);
      if (idx !== -1) {
        tagArr.splice(idx, 1);
        if (!tagArr.includes(targetTag)) {
          tagArr.push(targetTag);
        }
        adapter.run('UPDATE knowledge_entries SET tags = ? WHERE id = ?', [tagArr.join(','), row.id]);
        merged++;
      }
    }
  } catch (e) {
    logger.error({ err: e }, 'Error in mergeKbTags:');
  }
  return merged;
}

export function getKbEntriesByTag(
  tagName: string, projectId?: string, userId?: string
): any[] {
  const entries: any[] = [];
  try {
    if (!tableExists()) return entries;
    const adapter = getIndexAdapter();
    const filter = buildAdminScopeFilter(projectId, userId);
    let rows: Record<string, unknown>[];
    if (filter) {
      rows = adapter.all<Record<string, unknown>>(
        `SELECT * FROM knowledge_entries WHERE tags LIKE ? AND (${filter.clause})`,
        [`%${tagName}%`, ...(filter.params as unknown[])]
      );
    } else {
      rows = adapter.all<Record<string, unknown>>(
        'SELECT * FROM knowledge_entries WHERE tags LIKE ?',
        [`%${tagName}%`]
      );
    }
    for (const row of rows) {
      if (!row.tags) continue;
      const tagArr = (row.tags as string).split(',').map((t) => t.trim());
      if (tagArr.includes(tagName)) {
        entries.push(row);
      }
    }
  } catch (e) {
    logger.error({ err: e }, 'Error in getKbEntriesByTag:');
  }
  return entries;
}
