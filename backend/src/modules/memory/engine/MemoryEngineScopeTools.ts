/**
 * MemoryEngine — scope transitions + tool usage (SA4E-31, SA4E-18).
 * Extracted from core.ts: scope promotion/demotion (IsolationLayer-backed
 * filtering) and tool_usage counters.
 */

import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import type {
  KBScope, ScopeContext, ToolUsageRow,
} from '../models.js';
import type { ProjectContext, ScopeFilter } from '../ProjectContext.js';
import { buildReadFilter } from '../IsolationLayer.js';
import { MemoryEngineSessionsAudit } from './MemoryEngineSessionsAudit.js';

/** Scope lifecycle operations and tool usage counters. */
export class MemoryEngineScopeTools extends MemoryEngineSessionsAudit {
  constructor(adapter: DatabaseAdapter) { super(adapter); }

  // ─── Scope Operations ─────────────────────────────────────────────

  async promoteEntry(entryId: number, targetScope: KBScope, projectId?: string): Promise<boolean> {
    const entry = await this.findById(entryId);
    if (!entry) return false;

    const validTransitions: Record<string, KBScope[]> = {
      USER: ['PROJECT'],
      PROJECT: ['SHARED'],
      SHARED: [],
    };

    const currentScope = (entry.scope ?? 'USER') as KBScope;
    if (!validTransitions[currentScope]?.includes(targetScope)) return false;

    if (currentScope === 'USER' && targetScope === 'PROJECT' && projectId) {
      await this.adapter.runAsync(
        `UPDATE knowledge_entries SET scope = ?, project_id = ?, updated_at = ${this.dialect.now()} WHERE id = ?`,
        [targetScope, projectId, entryId],
      );
    } else {
      await this.adapter.runAsync(
        `UPDATE knowledge_entries SET scope = ?, updated_at = ${this.dialect.now()} WHERE id = ?`,
        [targetScope, entryId],
      );
    }

    await this.adapter.runAsync(
      `INSERT INTO consolidation_log (entry_id, from_tier, to_tier, reason) VALUES (?, ?, ?, ?)`,
      [entryId, currentScope, targetScope, `Promoted: ${currentScope} → ${targetScope}`],
    );

    await this.auditLog('PROMOTE', entryId);
    return true;
  }

  async demoteEntry(entryId: number, targetScope: KBScope): Promise<boolean> {
    const entry = await this.findById(entryId);
    if (!entry) return false;

    const validTransitions: Record<string, KBScope[]> = {
      SHARED: ['PROJECT'],
      PROJECT: ['USER'],
      USER: [],
    };

    const currentScope = (entry.scope ?? 'USER') as KBScope;
    if (!validTransitions[currentScope]?.includes(targetScope)) return false;

    await this.adapter.runAsync(
      `UPDATE knowledge_entries SET scope = ?, updated_at = ${this.dialect.now()} WHERE id = ?`,
      [targetScope, entryId],
    );

    await this.auditLog('DEMOTE', entryId);
    return true;
  }

  // SA4E-31: delegate to IsolationLayer (single source of truth) for scope isolation.
  private scopeFilter(ctx: ScopeContext, tableAlias?: string): ScopeFilter {
    const pctx = { projectId: ctx.projectId ?? '', userId: ctx.userId, createdAt: '' } as ProjectContext;
    return buildReadFilter(pctx, tableAlias);
  }

  buildScopeClause(ctx: ScopeContext, tableAlias?: string): string {
    return this.scopeFilter(ctx, tableAlias).clause;
  }

  buildScopeParams(ctx: ScopeContext): unknown[] {
    return [...this.scopeFilter(ctx).params];
  }

  // ─── Tool Usage (SA4E-18) ─────────────────────────────────────────

  async incrementToolUsage(toolName: string): Promise<void> {
    await this.adapter.runAsync(`
      INSERT INTO tool_usage (tool_name, call_count, last_called_at)
      VALUES (?, 1, ${this.dialect.now()})
      ON CONFLICT(tool_name) DO UPDATE SET
        call_count = tool_usage.call_count + 1,
        last_called_at = ${this.dialect.now()}
    `, [toolName]);
  }

  async getToolUsage(toolName?: string): Promise<ToolUsageRow[]> {
    return (toolName
      ? this.adapter.allAsync<ToolUsageRow>(
          'SELECT tool_name, call_count, last_called_at FROM tool_usage WHERE tool_name = ?',
          [toolName],
        )
      : this.adapter.allAsync<ToolUsageRow>(
          'SELECT tool_name, call_count, last_called_at FROM tool_usage ORDER BY call_count DESC',
        ));
  }
}
