/**
 * admin/db/config.ts — Configuration change history tracking.
 * SA4E-50: All functions are async; use getAdminAdapter() for multi-DB support.
 */

import { getAdminAdapter } from './core.js';

export interface ConfigChange {
  id: number;
  section: string;
  key: string;
  oldValue: string | null;
  newValue: string;
  changedBy: string;
  changedAt: string;
  requiresRestart: boolean;
}

/** Map raw DB row to typed ConfigChange. */
function rowToConfigChange(r: any): ConfigChange {
  return {
    id: r.id,
    section: r.section,
    key: r.key,
    oldValue: r.old_value,
    newValue: r.new_value,
    changedBy: r.changed_by,
    changedAt: r.changed_at,
    requiresRestart: !!r.requires_restart,
  };
}

/**
 * Record a configuration change and prune old records keeping the latest 50.
 */
export async function recordConfigChange(
  section: string,
  key: string,
  oldValue: string | null,
  newValue: string,
  changedBy: string,
  requiresRestart: boolean,
): Promise<void> {
  const adapter = getAdminAdapter();
  await adapter.runAsync(
    `INSERT INTO config_changes (section, key, old_value, new_value, changed_by, changed_at, requires_restart)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [section, key, oldValue, newValue, changedBy, new Date().toISOString(), requiresRestart ? 1 : 0],
  );
  // Prune: keep only the most recent 50 entries
  await adapter.runAsync(
    `DELETE FROM config_changes WHERE id NOT IN (
       SELECT id FROM config_changes ORDER BY changed_at DESC LIMIT 50
     )`,
  );
}

/**
 * Retrieve recent configuration change history.
 * @param limit - Max entries (default 10)
 */
export async function getConfigChanges(limit = 10): Promise<ConfigChange[]> {
  const adapter = getAdminAdapter();
  const rows = await adapter.allAsync<any>(
    'SELECT * FROM config_changes ORDER BY changed_at DESC LIMIT ?', [limit],
  );
  return rows.map(rowToConfigChange);
}
