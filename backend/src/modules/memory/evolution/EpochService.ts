/**
 * EpochService — epoch boundary management.
 * SA4E-53: converted to async DatabaseAdapter for PostgreSQL compatibility.
 * Triggers re-verification of knowledge entries when a major version change occurs.
 */

import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import { DialectHelper } from '../../../database/dialect/DialectHelper.js';
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
  private readonly adapter: DatabaseAdapter;
  private readonly dialect: DialectHelper;
  private readonly logger: Logger;

  constructor(adapter: DatabaseAdapter, logger: Logger) {
    this.adapter = adapter;
    this.dialect = new DialectHelper(adapter.getEngine());
    this.logger = logger.child({ service: 'epoch' });
  }

  async trigger(scope: string, epochId: string): Promise<EpochTriggerResult> {
    const pattern = `%${scope}%`;
    const entries = await this.adapter.allAsync<{ id: number }>(`
      SELECT id FROM knowledge_entries
      WHERE archived = 0
        AND (source_ref LIKE ? OR tags LIKE ? OR scope = ?)
    `, [pattern, pattern, scope]);

    const ids = entries.map(e => e.id);
    if (ids.length > 0) {
      await this.flagEntries(ids, epochId);
    }

    await this.auditEpoch(epochId, scope, ids.length);
    this.logger.info({ epochId, scope, affected: ids.length }, 'Epoch triggered');
    return { epoch_id: epochId, affected_count: ids.length, entry_ids: ids };
  }

  async verify(entryId: number, comment?: string): Promise<boolean> {
    const entry = await this.getEntry(entryId);
    if (!entry) throw new Error('ENTRY_NOT_FOUND');
    if (entry.needs_verification !== 1) throw new Error('NOT_FLAGGED');

    await this.adapter.runAsync(`
      UPDATE knowledge_entries
      SET needs_verification = 0, confidence = 1.0, updated_at = ${this.dialect.now()}
      WHERE id = ?
    `, [entryId]);

    await this.auditAction('EPOCH_VERIFY', entryId, comment);
    return true;
  }

  async reject(entryId: number, comment?: string): Promise<boolean> {
    const entry = await this.getEntry(entryId);
    if (!entry) throw new Error('ENTRY_NOT_FOUND');
    if (entry.needs_verification !== 1) throw new Error('NOT_FLAGGED');

    await this.adapter.runAsync(`
      UPDATE knowledge_entries
      SET archived = 1, needs_verification = 0, updated_at = ${this.dialect.now()}
      WHERE id = ?
    `, [entryId]);

    await this.auditAction('EPOCH_REJECT', entryId, comment);
    return true;
  }

  async getStatus(epochId?: string): Promise<EpochStatus> {
    if (epochId) return this.statusByEpoch(epochId);
    return this.statusAll();
  }

  private async flagEntries(ids: number[], epochId: string): Promise<void> {
    for (const id of ids) {
      await this.adapter.runAsync(`
        UPDATE knowledge_entries
        SET needs_verification = 1, epoch_id = ?, updated_at = ${this.dialect.now()}
        WHERE id = ?
      `, [epochId, id]);
    }
  }

  private async getEntry(entryId: number): Promise<{ id: number; needs_verification: number } | undefined> {
    return this.adapter.getAsync<{ id: number; needs_verification: number }>(
      'SELECT id, needs_verification FROM knowledge_entries WHERE id = ?',
      [entryId],
    );
  }

  private async statusByEpoch(epochId: string): Promise<EpochStatus> {
    const pending = await this.adapter.getAsync<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM knowledge_entries WHERE epoch_id = ? AND needs_verification = 1',
      [epochId],
    );
    const verified = await this.adapter.getAsync<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM knowledge_entries WHERE epoch_id = ? AND needs_verification = 0',
      [epochId],
    );
    return { pending_count: pending?.cnt ?? 0, verified_count: verified?.cnt ?? 0 };
  }

  private async statusAll(): Promise<EpochStatus> {
    const pending = await this.adapter.getAsync<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM knowledge_entries WHERE needs_verification = 1',
    );
    const verified = await this.adapter.getAsync<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM knowledge_entries WHERE needs_verification = 0 AND epoch_id IS NOT NULL',
    );
    return { pending_count: pending?.cnt ?? 0, verified_count: verified?.cnt ?? 0 };
  }

  private async auditEpoch(epochId: string, scope: string, count: number): Promise<void> {
    await this.adapter.runAsync(
      `INSERT INTO memory_audit (operation, details) VALUES (?, ?)`,
      ['EPOCH_TRIGGER', JSON.stringify({ epoch_id: epochId, scope, affected: count })],
    );
  }

  private async auditAction(operation: string, entryId: number, comment?: string): Promise<void> {
    await this.adapter.runAsync(
      `INSERT INTO memory_audit (operation, entry_id, details) VALUES (?, ?, ?)`,
      [operation, entryId, comment ?? null],
    );
  }
}
