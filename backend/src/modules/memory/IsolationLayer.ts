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

  if (ctx.projectId) {
    return {
      clause: `(${p}scope = 'SHARED' OR (${p}scope = 'PROJECT' AND (${p}project_id = ? OR ${p}project_id IS NULL)) OR (${p}scope = 'USER' AND ${p}user_id = ?))`,
      params: [ctx.projectId, ctx.userId],
    };
  }

  // Backward compat: no projectId -> permissive mode
  return {
    clause: `(${p}scope IN ('PROJECT', 'SHARED') OR (${p}scope = 'USER' AND ${p}user_id = ?))`,
    params: [ctx.userId],
  };
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
  if (entry.scope === 'SHARED') return entry;
  if (entry.scope === 'USER') {
    return entry.user_id === ctx.userId ? entry : undefined;
  }
  if (entry.scope === 'PROJECT') {
    if (!ctx.projectId) return entry; // backward compat
    if (entry.project_id === null || entry.project_id === ctx.projectId) return entry;
    return undefined; // wrong project
  }
  return entry;
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
  if (entry.scope === 'USER') {
    if (entry.user_id !== ctx.userId) {
      return { allowed: false, reason: `USER entry owned by ${entry.user_id}, not ${ctx.userId}` };
    }
  }
  if (entry.scope === 'PROJECT') {
    if (entry.project_id !== null && entry.project_id !== ctx.projectId) {
      return { allowed: false, reason: `PROJECT entry belongs to ${entry.project_id}, not ${ctx.projectId}` };
    }
  }
  // SHARED: always mutable. PROJECT with NULL: always mutable (legacy).
  return { allowed: true };
}
