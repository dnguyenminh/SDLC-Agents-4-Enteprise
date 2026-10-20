/**
 * SA4E-167 — GateGuardService unit tests — shared fixtures.
 * (Split from GateGuardService.test.ts — BR-18 ≤200 lines/file.)
 *
 * Uses in-memory mock repository — no real SQLite dependency.
 * SA4E-215: repository + service methods are async (multi-engine support).
 */
import pino from 'pino';
import type { GateGuardRepository } from '../GateGuardRepository.js';
import type { DenyPattern, GateGuardAction, AuditEntry } from '../models.js';
import type { InsertAuditParams } from '../GateGuardRepository.js';

/** In-memory mock repository — satisfies GateGuardRepository interface (async) */
export class MockGateGuardRepository implements Pick<GateGuardRepository,
  'ensureSchema' | 'insertAudit' | 'queryAudit' | 'getPatterns' | 'addPattern' | 'removePattern'
> {
  private patterns: DenyPattern[] = [];
  private auditLog: AuditEntry[] = [];

  async ensureSchema(): Promise<void> { /* no-op for in-memory */ }

  async insertAudit(params: InsertAuditParams): Promise<void> {
    this.auditLog.push({
      id: this.auditLog.length + 1,
      timestamp: new Date().toISOString(),
      command: params.command,
      agent: params.agent,
      patternMatched: params.patternMatched,
      action: params.action,
      overrideBy: params.overrideBy,
      projectId: params.projectId,
      contextJson: params.contextJson,
    });
  }

  async queryAudit(
    projectId?: string, limit = 50, actionFilter?: GateGuardAction,
  ): Promise<AuditEntry[]> {
    let entries = [...this.auditLog];
    if (projectId) entries = entries.filter(e => e.projectId === projectId);
    if (actionFilter) entries = entries.filter(e => e.action === actionFilter);
    return entries.slice(0, limit);
  }

  async getPatterns(projectId?: string): Promise<DenyPattern[]> {
    if (projectId) {
      return this.patterns.filter(
        p => p.projectId === projectId || !p.projectId,
      );
    }
    return [...this.patterns];
  }

  async addPattern(pattern: DenyPattern): Promise<void> {
    this.patterns.push(pattern);
  }

  async removePattern(patternId: string): Promise<boolean> {
    const idx = this.patterns.findIndex(
      p => p.id === patternId && !p.isDefault,
    );
    if (idx === -1) return false;
    this.patterns.splice(idx, 1);
    return true;
  }
}

export const logger = pino({ level: 'silent' });
