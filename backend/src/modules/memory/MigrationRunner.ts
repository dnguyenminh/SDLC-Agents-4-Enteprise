/**
 * MigrationRunner — versioned schema migration system.
 * Replaces fragile try/catch ALTER TABLE approach (SA4E-26).
 * Implements BR-10 through BR-15.
 */

import type Database from 'better-sqlite3';

export interface Migration {
  version: number;
  name: string;
  up: string;
}

const REGISTERED_MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'add_project_id_column',
    up: [
      'ALTER TABLE knowledge_entries ADD COLUMN project_id TEXT DEFAULT NULL',
      'CREATE INDEX IF NOT EXISTS idx_ke_project_id ON knowledge_entries(project_id)',
      'CREATE INDEX IF NOT EXISTS idx_ke_scope_project ON knowledge_entries(scope, project_id)',
    ].join(';\n'),
  },
];

export class MigrationRunner {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  run(): { applied: number; skipped: number; total: number } {
    this.ensureTrackingTable();
    const applied = this.getAppliedVersions();
    let appliedCount = 0;
    let skippedCount = 0;

    // Downgrade detection (TA Decision #5)
    const maxDb = applied.length > 0 ? Math.max(...applied) : 0;
    const maxCode = REGISTERED_MIGRATIONS.length > 0
      ? REGISTERED_MIGRATIONS[REGISTERED_MIGRATIONS.length - 1].version
      : 0;
    if (maxDb > maxCode) {
      console.warn(
        `[MigrationRunner] DB version (${maxDb}) ahead of code (${maxCode}). Forward-only — continuing.`,
      );
    }

    for (const m of REGISTERED_MIGRATIONS) {
      if (applied.includes(m.version)) {
        skippedCount++;
        continue;
      }

      try {
        for (const stmt of m.up.split(';\n').filter(s => s.trim())) {
          try {
            this.db.exec(stmt);
          } catch (stmtErr: unknown) {
            const stmtMsg = stmtErr instanceof Error ? stmtErr.message : String(stmtErr);
            if (stmtMsg.includes('duplicate column')) {
              // SA4E-26 leftover — column already exists, continue with remaining statements
              console.info(`[MigrationRunner] v${m.version} (${m.name}): column exists, recording as applied.`);
            } else {
              throw stmtErr;
            }
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Migration v${m.version} (${m.name}) failed: ${msg}`);
      }

      this.db.prepare(
        'INSERT INTO schema_migrations (version, name, applied_at, checksum) VALUES (?, ?, ?, ?)',
      ).run(m.version, m.name, new Date().toISOString(), null);
      appliedCount++;
    }

    if (appliedCount > 0) {
      console.info(`[MigrationRunner] Applied ${appliedCount} migration(s).`);
    }

    return { applied: appliedCount, skipped: skippedCount, total: REGISTERED_MIGRATIONS.length };
  }

  getAppliedVersions(): number[] {
    try {
      return (this.db.prepare('SELECT version FROM schema_migrations ORDER BY version')
        .all() as Array<{ version: number }>).map(r => r.version);
    } catch {
      return []; // Table doesn't exist yet
    }
  }

  getCurrentVersion(): number {
    const versions = this.getAppliedVersions();
    return versions.length > 0 ? Math.max(...versions) : 0;
  }

  private ensureTrackingTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL,
        checksum TEXT
      )
    `);
  }
}
