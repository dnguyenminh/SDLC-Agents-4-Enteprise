/**
 * MemoryEngine — session + audit operations.
 * Extracted from core.ts: memory_sessions lifecycle and memory_audit writes.
 */

import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import { MemoryEngineCrud } from './crud.js';

/** Session tracking and audit trail operations. */
export class MemoryEngineSessionsAudit extends MemoryEngineCrud {
  protected currentSessionId: string | null = null;

  constructor(adapter: DatabaseAdapter) { super(adapter); }

  // ─── Sessions ─────────────────────────────────────────────────────
  async startSession(agentName?: string): Promise<string> {
    const sid = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await this.adapter.runAsync(
      `INSERT INTO memory_sessions (session_id, agent_name) VALUES (?, ?)`,
      [sid, agentName ?? null],
    );
    this.currentSessionId = sid;
    await this.auditLog('SESSION_START', undefined, sid);
    return sid;
  }

  async endSession(): Promise<void> {
    if (!this.currentSessionId) return;
    await this.adapter.runAsync(
      `UPDATE memory_sessions SET ended_at = ${this.dialect.now()}, status = 'ended' WHERE session_id = ?`,
      [this.currentSessionId],
    );
    await this.auditLog('SESSION_END', undefined, this.currentSessionId);
    this.currentSessionId = null;
  }

  async listSessions(limit = 20): Promise<any[]> {
    return this.adapter.allAsync<any>(
      'SELECT * FROM memory_sessions ORDER BY started_at DESC LIMIT ?',
      [limit],
    );
  }

  // ─── Audit ────────────────────────────────────────────────────────

  async auditLog(operation: string, entryId?: number, sessionId?: string): Promise<void> {
    await this.adapter.runAsync(
      `INSERT INTO memory_audit (operation, entry_id, session_id) VALUES (?, ?, ?)`,
      [operation, entryId ?? null, sessionId ?? this.currentSessionId ?? null],
    );
  }

  async listAudit(limit = 20, operation?: string): Promise<any[]> {
    if (operation) {
      return this.adapter.allAsync<any>(
        'SELECT * FROM memory_audit WHERE operation = ? ORDER BY created_at DESC LIMIT ?',
        [operation, limit],
      );
    }
    return this.adapter.allAsync<any>(
      'SELECT * FROM memory_audit ORDER BY created_at DESC LIMIT ?',
      [limit],
    );
  }
}
