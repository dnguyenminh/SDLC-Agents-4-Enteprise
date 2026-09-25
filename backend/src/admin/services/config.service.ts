// KSA-286: Config Service
import { ConfigEntry, ConfigHistoryEntry, ConfigUpdateResult } from '../types/admin.types.js';

export class ConfigService {
  private runtime = new Map<string, any>();
  constructor(private db: any) { for (const e of this.db.prepare('SELECT * FROM config_entries').all()) { this.runtime.set(`${e.section}:${e.key}`, JSON.parse(e.value)); } }

  getAll(sections?: string[]): ConfigEntry[] {
    const rows = sections?.length ? this.db.prepare(`SELECT * FROM config_entries WHERE section IN (${sections.map(()=>'?').join(',')}) ORDER BY section,key`).all(...sections) : this.db.prepare('SELECT * FROM config_entries ORDER BY section,key').all();
    return rows.map((r: any) => ({ section: r.section, key: r.key, value: r.value, type: r.type, defaultValue: r.default_value, requiresRestart: !!r.requires_restart, lastModified: r.last_modified, modifiedBy: r.modified_by }));
  }

  update(section: string, key: string, newValue: any, userId: string): ConfigUpdateResult {
    const entry = this.db.prepare('SELECT * FROM config_entries WHERE section = ? AND key = ?').get(section, key);
    if (!entry) throw { code: 'ENTRY_NOT_FOUND' };
    const val = JSON.stringify(newValue);
    this.db.transaction(() => { this.db.prepare('UPDATE config_entries SET value=?, last_modified=datetime("now"), modified_by=? WHERE section=? AND key=?').run(val, userId, section, key); this.db.prepare('INSERT INTO config_history (history_id,section,key,old_value,new_value,changed_by) VALUES (?,?,?,?,?,?)').run(crypto.randomUUID(), section, key, entry.value, val, userId); })();
    if (!entry.requires_restart) { this.runtime.set(`${section}:${key}`, newValue); return { applied: true, requiresRestart: false }; }
    return { applied: false, requiresRestart: true };
  }

  getHistory(limit = 10): ConfigHistoryEntry[] {
    return this.db.prepare('SELECT * FROM config_history ORDER BY changed_at DESC LIMIT ?').all(limit).map((r: any) => ({ historyId: r.history_id, section: r.section, key: r.key, oldValue: r.old_value, newValue: r.new_value, changedAt: r.changed_at, changedBy: r.changed_by }));
  }

  get(section: string, key: string): any { return this.runtime.get(`${section}:${key}`); }
}

