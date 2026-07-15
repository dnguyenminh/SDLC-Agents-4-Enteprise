/**
 * EpochService — epoch boundary management.
 * Triggers re-verification of knowledge entries when a major version change occurs.
 */

import type Database from 'better-sqlite3';
import type { Logger } from 'pino';

export interface EpochTriggerResult {
  epoch_id: string;
  affected_count: number;
  entry_ids: number[];
}

export interface EpochStatus {
  pending_count: number;
  verified_count: number;
}

export class EpochService {
  private readonly db: Database.Database;
  private readonly logger: Logger;

  constructor(db: Database.Database, logger: Logger) {
    this.db = db;
    this.logger = logger.child({ service: 'epoch' });
  }

  trigger(scope: string, epochId: string): EpochTriggerResult {
    const pattern = `%${scope}%`;
    const entries = this.db.prepare(`
      SELECT id FROM knowledge_entries
      WHERE archived = 0
        AND (source_ref LIKE ? OR tags LIKE ? OR scope = ?)
    `).all(pattern, pattern, scope) as Array<{ id: number }>;

    const ids = entries.map(e => e.id);
    if (ids.length > 0) {
      this.flagEntries(ids, epochId);
    }

    this.auditEpoch(epochId, scope, ids.length);
    this.logger.info({ epochId, scope, affected: ids.length }, 'Epoch triggered');
    return { epoch_id: epochId, affected_count: ids.length, entry_ids: ids };
  }

  verify(entryId: number, comment?: string): boolean {
    const entry = this.getEntry(entryId);
    if (!entry) throw new Error('ENTRY_NOT_FOUND');
    if (entry.needs_verification !== 1) throw new Error('NOT_FLAGGED');

    this.db.prepare(`
      UPDATE knowledge_entries
      SET needs_verification = 0, confidence = 1.0, updated_at = datetime('now')
      WHERE id = ?
    `).run(entryId);

    this.auditAction('EPOCH_VERIFY', entryId, comment);
    return true;
  }

  reject(entryId: number, comment?: string): boolean {
    const entry = this.getEntry(entryId);
    if (!entry) throw new Error('ENTRY_NOT_FOUND');
    if (entry.needs_verification !== 1) throw new Error('NOT_FLAGGED');

    this.db.prepare(`
      UPDATE knowledge_entries
      SET archived = 1, needs_verification = 0, updated_at = datetime('now')
      WHERE id = ?
    `).run(entryId);

    this.auditAction('EPOCH_REJECT', entryId, comment);
    return true;
  }

  getStatus(epochId?: string): EpochStatus {
    if (epochId) {
      return this.statusByEpoch(epochId);
    }
    return this.statusAll();
  }

  private flagEntries(ids: number[], epochId: string): void {
    const stmt = this.db.prepare(`
      UPDATE knowledge_entries
      SET needs_verification = 1, epoch_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `);
    const txn = this.db.transaction(() => {
      for (const id of ids) stmt.run(epochId, id);
    });
    txn();
  }

  private getEntry(entryId: number): { id: number; needs_verification: number } | undefined {
    return this.db.prepare(
      'SELECT id, needs_verification FROM knowledge_entries WHERE id = ?',
    ).get(entryId) as { id: number; needs_verification: number } | undefined;
  }

  private statusByEpoch(epochId: string): EpochStatus {
    const pending = this.db.prepare(
      'SELECT COUNT(*) as cnt FROM knowledge_entries WHERE epoch_id = ? AND needs_verification = 1',
    ).get(epochId) as { cnt: number };
    const verified = this.db.prepare(
      'SELECT COUNT(*) as cnt FROM knowledge_entries WHERE epoch_id = ? AND needs_verification = 0',
    ).get(epochId) as { cnt: number };
    return { pending_count: pending.cnt, verified_count: verified.cnt };
  }

  private statusAll(): EpochStatus {
    const pending = this.db.prepare(
      'SELECT COUNT(*) as cnt FROM knowledge_entries WHERE needs_verification = 1',
    ).get() as { cnt: number };
    const verified = this.db.prepare(
      'SELECT COUNT(*) as cnt FROM knowledge_entries WHERE needs_verification = 0 AND epoch_id IS NOT NULL',
    ).get() as { cnt: number };
    return { pending_count: pending.cnt, verified_count: verified.cnt };
  }

  private auditEpoch(epochId: string, scope: string, count: number): void {
    this.db.prepare(
      `INSERT INTO memory_audit (operation, details) VALUES (?, ?)`,
    ).run('EPOCH_TRIGGER', JSON.stringify({ epoch_id: epochId, scope, affected: count }));
  }

  private auditAction(operation: string, entryId: number, comment?: string): void {
    this.db.prepare(
      `INSERT INTO memory_audit (operation, entry_id, details) VALUES (?, ?, ?)`,
    ).run(operation, entryId, comment ?? null);
  }
}
