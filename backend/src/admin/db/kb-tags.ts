/**
 * admin/db/kb-tags.ts — KB tag management via DatabaseAdapter.
 * SA4E-50: All functions are async; use getIndexAdapter() for multi-DB support.
 */

import { getIndexAdapter, getActiveEngine, logger } from './core.js';
import { buildAdminScopeFilter } from './kb-scope-filter.js';

/** Check if knowledge_entries table exists (SQLite only guard). */
async function tableExists(): Promise<boolean> {
  const adapter = getIndexAdapter();
  if (!adapter.isConnected()) return false; // PG not yet connected — skip gracefully
  if (getActiveEngine() !== 'sqlite') return true;
  const row = await adapter.getAsync<{ cnt: number }>(
    "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='knowledge_entries'",
  );
  return (row?.cnt ?? 0) > 0;
}

/** Parse comma-separated tags string into a trimmed, non-empty array. */
function parseTags(raw: string): string[] {
  return raw.split(',').map(t => t.trim()).filter(t => t.length > 0);
}

/**
 * Get all tags with usage counts across KB entries.
 * @returns Map of tag name → { count, lastUsed }
 */
export async function getAllKbTags(
  projectId?: string,
  userId?: string,
): Promise<Record<string, { count: number; lastUsed: string }>> {
  const tagCounts: Record<string, { count: number; lastUsed: string }> = {};
  try {
    if (!(await tableExists())) return tagCounts;
    const adapter = getIndexAdapter();
    const filter = buildAdminScopeFilter(projectId, userId);
    let rows: { tags: string; created_at: string }[];

    if (filter) {
      rows = await adapter.allAsync<{ tags: string; created_at: string }>(
        `SELECT tags, created_at FROM knowledge_entries WHERE tags IS NOT NULL AND tags != '' AND (${filter.clause})`,
        filter.params as unknown[],
      );
    } else {
      rows = await adapter.allAsync<{ tags: string; created_at: string }>(
        "SELECT tags, created_at FROM knowledge_entries WHERE tags IS NOT NULL AND tags != ''",
      );
    }

    for (const row of rows) {
      if (!row.tags) continue;
      for (const tag of parseTags(row.tags)) {
        if (!tagCounts[tag]) tagCounts[tag] = { count: 0, lastUsed: row.created_at || new Date().toISOString() };
        tagCounts[tag].count++;
        if (row.created_at && new Date(row.created_at) > new Date(tagCounts[tag].lastUsed)) {
          tagCounts[tag].lastUsed = row.created_at;
        }
      }
    }
  } catch (e) {
    logger.error({ err: e }, 'Error in getAllKbTags');
  }
  return tagCounts;
}

/**
 * Replace all tags on a KB entry.
 * @param entryId - ID of the entry to update
 * @param tags - New tag list
 */
export async function updateKbEntryTags(entryId: string, tags: string[]): Promise<void> {
  try {
    if (!(await tableExists())) return;
    const adapter = getIndexAdapter();
    await adapter.runAsync(
      'UPDATE knowledge_entries SET tags = ? WHERE id = ?',
      [tags.join(','), entryId],
    );
  } catch (e) {
    logger.error({ err: e }, 'Error in updateKbEntryTags');
  }
}

/**
 * Rename a tag across all entries.
 * @returns Number of entries updated
 */
export async function renameKbTag(oldName: string, newName: string): Promise<number> {
  let renamed = 0;
  try {
    if (!(await tableExists())) return 0;
    const adapter = getIndexAdapter();
    const rows = await adapter.allAsync<{ id: string; tags: string }>(
      'SELECT id, tags FROM knowledge_entries WHERE tags LIKE ?',
      [`%${oldName}%`],
    );
    for (const row of rows) {
      if (!row.tags) continue;
      const tagArr = parseTags(row.tags);
      const idx = tagArr.indexOf(oldName);
      if (idx !== -1) {
        tagArr[idx] = newName.trim();
        await adapter.runAsync('UPDATE knowledge_entries SET tags = ? WHERE id = ?', [tagArr.join(','), row.id]);
        renamed++;
      }
    }
  } catch (e) {
    logger.error({ err: e }, 'Error in renameKbTag');
  }
  return renamed;
}

/**
 * Remove a tag from all entries.
 * @returns Number of entries updated
 */
export async function deleteKbTag(tagName: string): Promise<number> {
  let removed = 0;
  try {
    if (!(await tableExists())) return 0;
    const adapter = getIndexAdapter();
    const rows = await adapter.allAsync<{ id: string; tags: string }>(
      'SELECT id, tags FROM knowledge_entries WHERE tags LIKE ?',
      [`%${tagName}%`],
    );
    for (const row of rows) {
      if (!row.tags) continue;
      const tagArr = parseTags(row.tags);
      const idx = tagArr.indexOf(tagName);
      if (idx !== -1) {
        tagArr.splice(idx, 1);
        await adapter.runAsync('UPDATE knowledge_entries SET tags = ? WHERE id = ?', [tagArr.join(','), row.id]);
        removed++;
      }
    }
  } catch (e) {
    logger.error({ err: e }, 'Error in deleteKbTag');
  }
  return removed;
}

/**
 * Merge sourceTag into targetTag across all entries.
 * @returns Number of entries updated
 */
export async function mergeKbTags(sourceTag: string, targetTag: string): Promise<number> {
  let merged = 0;
  try {
    if (!(await tableExists())) return 0;
    const adapter = getIndexAdapter();
    const rows = await adapter.allAsync<{ id: string; tags: string }>(
      'SELECT id, tags FROM knowledge_entries WHERE tags LIKE ?',
      [`%${sourceTag}%`],
    );
    for (const row of rows) {
      if (!row.tags) continue;
      const tagArr = parseTags(row.tags);
      const idx = tagArr.indexOf(sourceTag);
      if (idx !== -1) {
        tagArr.splice(idx, 1);
        if (!tagArr.includes(targetTag)) tagArr.push(targetTag);
        await adapter.runAsync('UPDATE knowledge_entries SET tags = ? WHERE id = ?', [tagArr.join(','), row.id]);
        merged++;
      }
    }
  } catch (e) {
    logger.error({ err: e }, 'Error in mergeKbTags');
  }
  return merged;
}

/**
 * Get all entries with a specific tag.
 * @returns Array of raw entry rows
 */
export async function getKbEntriesByTag(
  tagName: string,
  projectId?: string,
  userId?: string,
): Promise<any[]> {
  try {
    if (!(await tableExists())) return [];
    const adapter = getIndexAdapter();
    const filter = buildAdminScopeFilter(projectId, userId);
    let rows: Record<string, unknown>[];

    if (filter) {
      rows = await adapter.allAsync<Record<string, unknown>>(
        `SELECT * FROM knowledge_entries WHERE tags LIKE ? AND (${filter.clause})`,
        [`%${tagName}%`, ...(filter.params as unknown[])],
      );
    } else {
      rows = await adapter.allAsync<Record<string, unknown>>(
        'SELECT * FROM knowledge_entries WHERE tags LIKE ?',
        [`%${tagName}%`],
      );
    }

    // Filter to exact tag matches (LIKE may include superset tags)
    return rows.filter(row => {
      if (!row.tags) return false;
      return parseTags(row.tags as string).includes(tagName);
    });
  } catch (e) {
    logger.error({ err: e }, 'Error in getKbEntriesByTag');
    return [];
  }
}
