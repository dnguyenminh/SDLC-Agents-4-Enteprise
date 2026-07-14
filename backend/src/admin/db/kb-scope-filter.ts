/**
 * SA4E-31 — Shared scope filter for admin KB reads.
 *
 * Single source of truth delegation: builds the same strict per-workspace
 * isolation WHERE clause used by the LLM path (IsolationLayer.buildReadFilter),
 * so the admin viewer cannot leak KB across workspaces.
 */

import { buildReadFilter } from '../../modules/memory/IsolationLayer.js';
import type { ProjectContext } from '../../modules/memory/ProjectContext.js';

export interface KbScopeFilter {
  clause: string;
  params: unknown[];
}

/**
 * Build a scope-isolation WHERE fragment for admin knowledge_entries reads.
 * Returns null when no project context is available (caller shows global/all view
 * only for explicit unscoped admin operations).
 */
export function buildAdminScopeFilter(projectId?: string, userId?: string, tableAlias?: string): KbScopeFilter | null {
  if (!projectId || projectId === 'default') return null;
  const ctx = { projectId, userId: userId || 'anonymous', createdAt: '' } as ProjectContext;
  const { clause, params } = buildReadFilter(ctx, tableAlias);
  return { clause, params: [...params] };
}
