/**
 * SA4E-132 — GateGuardRepository: append-only audit log + denylist pattern storage.
 * Repository pattern: abstracts SQLite access for GateGuard data.
 * BR-1204: Audit trail is append-only — no UPDATE or DELETE on audit entries.
 */

import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import type { AuditEntry, DenyPattern, GateGuardAction } from './models.js';

export interface InsertAuditParams {
  command: string;
  agent?: string;
  patternMatched?: string;
  action: GateGuardAction;
  overrideBy?: string;
  projectId?: string;
  contextJson?: string;
}

export class GateGuardRepository {
  constructor(private readonly adapter: DatabaseAdapter) {}

  /** Create gateguard_audit + gateguard_denylist tables if absent */
  async ensureSchema(): Promise<void> {
    const engine = this.adapter.getEngine();
    if (engine === 'postgresql') {
      await this.adapter.execAsync(
        `CREATE TABLE IF NOT EXISTS gateguard_audit (
          id SERIAL PRIMARY KEY,
          timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          command TEXT NOT NULL,
          agent TEXT,
          pattern_matched TEXT,
          action TEXT NOT NULL CHECK(action IN ('blocked','overridden','allowed')),
          override_by TEXT,
          project_id TEXT,
          context_json TEXT
        )`
      );
      await this.adapter.execAsync(
        'CREATE INDEX IF NOT EXISTS idx_gateguard_audit_time ON gateguard_audit(timestamp DESC)'
      );
      await this.adapter.execAsync(
        'CREATE INDEX IF NOT EXISTS idx_gateguard_audit_project ON gateguard_audit(project_id, timestamp DESC)'
      );
      await this.adapter.execAsync(
        `CREATE TABLE IF NOT EXISTS gateguard_denylist (
          id TEXT PRIMARY KEY,
          regex TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          is_default INTEGER NOT NULL DEFAULT 0,
          project_id TEXT
        )`
      );
    } else {
      this.adapter.exec(
        `CREATE TABLE IF NOT EXISTS gateguard_audit (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp TEXT NOT NULL DEFAULT (datetime('now')),
          command TEXT NOT NULL,
          agent TEXT,
          pattern_matched TEXT,
          action TEXT NOT NULL CHECK(action IN ('blocked','overridden','allowed')),
          override_by TEXT,
          project_id TEXT,
          context_json TEXT
        )`
      );
      this.adapter.exec(
        'CREATE INDEX IF NOT EXISTS idx_gateguard_audit_time ON gateguard_audit(timestamp DESC)'
      );
      this.adapter.exec(
        'CREATE INDEX IF NOT EXISTS idx_gateguard_audit_project ON gateguard_audit(project_id, timestamp DESC)'
      );
      this.adapter.exec(
        `CREATE TABLE IF NOT EXISTS gateguard_denylist (
          id TEXT PRIMARY KEY,
          regex TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          is_default INTEGER NOT NULL DEFAULT 0,
          project_id TEXT
        )`
      );
    }
  }

  /** BR-1204: Append-only audit insert — never update or delete */
  async insertAudit(params: InsertAuditParams): Promise<void> {
    await this.adapter.runAsync(
      'INSERT INTO gateguard_audit' +
      ' (command, agent, pattern_matched, action, override_by, project_id, context_json)' +
      ' VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        params.command,
        params.agent ?? null,
        params.patternMatched ?? null,
        params.action,
        params.overrideBy ?? null,
        params.projectId ?? null,
        params.contextJson ?? null,
      ],
    );
  }

  /** Query audit entries with optional filters */
  async queryAudit(projectId?: string, limit = 50, actionFilter?: GateGuardAction): Promise<AuditEntry[]> {
    let sql = 'SELECT * FROM gateguard_audit WHERE 1=1';
    const params: unknown[] = [];

    if (projectId) {
      sql += ' AND project_id = ?';
      params.push(projectId);
    }
    if (actionFilter) {
      sql += ' AND action = ?';
      params.push(actionFilter);
    }
    sql += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);

    const rows = await this.adapter.allAsync<Record<string, unknown>>(sql, params);
    return rows.map(mapAuditRow);
  }

  /** Load all custom denylist patterns for a project */
  async getPatterns(projectId?: string): Promise<DenyPattern[]> {
    let sql = 'SELECT * FROM gateguard_denylist WHERE 1=1';
    const params: unknown[] = [];
    if (projectId) {
      sql += ' AND (project_id = ? OR project_id IS NULL)';
      params.push(projectId);
    }
    const rows = await this.adapter.allAsync<Record<string, unknown>>(sql, params);
    return rows.map(mapPatternRow);
  }

  /** Add a custom denylist pattern */
  async addPattern(pattern: DenyPattern): Promise<void> {
    await this.adapter.runAsync(
      'INSERT INTO gateguard_denylist (id, regex, description, is_default, project_id)' +
      ' VALUES (?, ?, ?, ?, ?)',
      [pattern.id, pattern.regex, pattern.description, pattern.isDefault ? 1 : 0, pattern.projectId ?? null],
    );
  }

  /** Remove a custom denylist pattern by ID — cannot remove defaults */
  async removePattern(patternId: string): Promise<boolean> {
    const result = await this.adapter.runAsync(
      'DELETE FROM gateguard_denylist WHERE id = ? AND is_default = 0',
      [patternId],
    );
    return result.changes > 0;
  }
}

// --- Row mappers ---

function mapAuditRow(row: Record<string, unknown>): AuditEntry {
  return {
    id: row.id as number,
    timestamp: row.timestamp as string,
    command: row.command as string,
    agent: row.agent as string | undefined,
    patternMatched: row.pattern_matched as string | undefined,
    action: row.action as GateGuardAction,
    overrideBy: row.override_by as string | undefined,
    projectId: row.project_id as string | undefined,
    contextJson: row.context_json as string | undefined,
  };
}

function mapPatternRow(row: Record<string, unknown>): DenyPattern {
  return {
    id: row.id as string,
    regex: row.regex as string,
    description: row.description as string,
    isDefault: row.is_default === 1,
    projectId: row.project_id as string | undefined,
  };
}
