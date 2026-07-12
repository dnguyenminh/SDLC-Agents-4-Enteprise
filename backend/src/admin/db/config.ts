import { getAdminDb } from './core.js';

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

export function recordConfigChange(section: string, key: string, oldValue: string | null, newValue: string, changedBy: string, requiresRestart: boolean): void {
  const d = getAdminDb();
  d.prepare(`INSERT INTO config_changes (section, key, old_value, new_value, changed_by, changed_at, requires_restart) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    section, key, oldValue, newValue, changedBy, new Date().toISOString(), requiresRestart ? 1 : 0
  );
  d.prepare(`DELETE FROM config_changes WHERE id NOT IN (SELECT id FROM config_changes ORDER BY changed_at DESC LIMIT 50)`).run();
}

export function getConfigChanges(limit = 10): ConfigChange[] {
  const d = getAdminDb();
  const rows = d.prepare('SELECT * FROM config_changes ORDER BY changed_at DESC LIMIT ?').all(limit) as any[];
  return rows.map(r => ({
    id: r.id,
    section: r.section,
    key: r.key,
    oldValue: r.old_value,
    newValue: r.new_value,
    changedBy: r.changed_by,
    changedAt: r.changed_at,
    requiresRestart: !!r.requires_restart,
  }));
}
