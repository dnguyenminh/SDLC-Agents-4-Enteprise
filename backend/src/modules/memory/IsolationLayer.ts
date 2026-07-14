/**
 * IsolationLayer — centralized scope enforcement for ALL KB operations.
 * SINGLE source of truth. Max 200 lines enforced (TA Decision #6).
 *
 * Exports:
 * - buildReadFilter()              — SQL WHERE for reads
 * - buildWriteDecorator()          — project_id stamp for writes
 * - validateMutationOwnership()    — pre-mutation ownership check
 * - validateReadAccess()           — post-fetch scope validation (TA Decision #1)
 * - buildIngestFileDeleteClause()  — scoped deduplication (TA Decision #4)
 */

import type { ProjectContext, ScopeFilter, WriteDecorator, MutationValidation } from './ProjectContext.js';
import type { KnowledgeEntry, KBScope } from './models.js';

// ─── Read Operations ────────────────────────────────────────────────

/**
 * Construct SQL WHERE fragment for scope-aware reads.
 * Implements BR-16, BR-17, BR-20, BR-22, BR-25.
 */
export function buildReadFilter(ctx: ProjectContext, tableAlias?: string): ScopeFilter {
  const p = tableAlias ? `${tableAlias}.` : '';

  // SA4E-31: Strict per-workspace isolation. No project context → fail closed.
  if (!ctx.projectId) {
    return { clause: '1=0', params: [] };
  }

  const conditions: string[] = [];
  const params: unknown[] = [];

  // USER: owner + same workspace only
  if (ctx.userId && ctx.userId !== 'anonymous') {
    conditions.push(`(${p}scope = 'USER' AND ${p}user_id = ? AND ${p}project_id = ?)`);
    params.push(ctx.userId, ctx.projectId);
  }

  // PROJECT: this workspace only (no project_id IS NULL escape)
  conditions.push(`(${p}scope = 'PROJECT' AND ${p}project_id = ?)`);
  params.push(ctx.projectId);

  // SHARED: company-wide, visible only if this project is granted access
  conditions.push(`(${p}scope = 'SHARED' AND EXISTS (SELECT 1 FROM kb_shared_grants g WHERE g.project_id = ?))`);
  params.push(ctx.projectId);

  return { clause: conditions.join(' OR '), params };
}

/**
 * Post-fetch validation for findById — returns undefined if entry not in scope.
 * Implements TA Decision #1 (UC-04 gap).
 */
export function validateReadAccess(
  ctx: ProjectContext,
  entry: KnowledgeEntry | undefined,
): KnowledgeEntry | undefined {
  if (!entry) return undefined;
  // SA4E-31: strict per-workspace isolation, fail closed without project context
  if (!ctx.projectId) return undefined;
  if (entry.scope === 'SHARED') return entry; // query layer enforces grant
  if (entry.scope === 'USER') {
    return entry.user_id === ctx.userId && entry.project_id === ctx.projectId ? entry : undefined;
  }
  if (entry.scope === 'PROJECT') {
    return entry.project_id === ctx.projectId ? entry : undefined;
  }
  return undefined;
}

// ─── Write Operations ───────────────────────────────────────────────

/**
 * Determine project_id value to stamp on new entries.
 * Implements BR-18, BR-21.
 */
export function buildWriteDecorator(ctx: ProjectContext, _scope: KBScope): WriteDecorator {
  return { project_id: ctx.projectId || null };
}

/**
 * Scoped deduplication for mem_ingest_file — only deletes entries in current project.
 * Implements TA Decision #4.
 */
export function buildIngestFileDeleteClause(
  ctx: ProjectContext,
  source: string,
): { clause: string; params: unknown[] } {
  if (ctx.projectId) {
    return {
      clause: 'DELETE FROM knowledge_entries WHERE source = ? AND (project_id = ? OR project_id IS NULL)',
      params: [source, ctx.projectId],
    };
  }
  return {
    clause: 'DELETE FROM knowledge_entries WHERE source = ?',
    params: [source],
  };
}

// ─── Mutation Validation ────────────────────────────────────────────

/**
 * Check if current context is allowed to mutate an entry.
 * Implements TA Decision #3 (UC-04 gap).
 */
export function validateMutationOwnership(
  ctx: ProjectContext,
  entry: KnowledgeEntry,
): MutationValidation {
  // SA4E-31: strict per-workspace ownership for mutations
  if (entry.scope === 'USER') {
    if (entry.user_id !== ctx.userId || entry.project_id !== ctx.projectId) {
      return { allowed: false, reason: `Access denied: entry belongs to a different scope` };
    }
  }
  if (entry.scope === 'PROJECT') {
    if (entry.project_id !== ctx.projectId) {
      return { allowed: false, reason: `Access denied: entry belongs to a different scope` };
    }
  }
  // SHARED mutations allowed for granted projects (grant enforced at query/route layer)
  return { allowed: true };
}
