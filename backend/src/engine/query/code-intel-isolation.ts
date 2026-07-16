/**
 * SA4E-41 — CodeIntelIsolation (Policy / Strategy).
 *
 * Single source of truth for Code Intelligence tenant-scoping SQL. Mirrors the
 * Knowledge Base IsolationLayer: fail-closed by default (no project_id ⇒ `1=0`),
 * so a forgotten or absent scope returns NOTHING rather than the whole corpus.
 */

export interface CodeScopeFilter {
  /** SQL WHERE fragment (already parameterized). */
  readonly clause: string;
  /** Bound parameters for the clause. */
  readonly params: readonly unknown[];
}

/**
 * Build a WHERE fragment scoping a query to one tenant. Fail-closed.
 * @param projectId  tenant id; empty/undefined ⇒ `1=0` (no rows).
 * @param alias      table alias holding the project_id column (default 's').
 */
export function buildCodeScopeFilter(projectId: string | undefined, alias = 's'): CodeScopeFilter {
  if (!projectId) return { clause: '1=0', params: [] }; // secure by default
  return { clause: `${alias}.project_id = ?`, params: [projectId] };
}

/**
 * Guard for write/index operations — throws if there is no tenant context.
 * Reads stay fail-closed (empty results); writes must fail loudly.
 */
export function requireProjectId(projectId: string | undefined): string {
  if (!projectId) {
    throw new Error('PROJECT_REQUIRED: code intelligence operation needs project_id');
  }
  return projectId;
}
