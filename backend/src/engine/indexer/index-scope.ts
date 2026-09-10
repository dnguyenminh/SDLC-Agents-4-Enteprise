/**
 * SA4E-41 — IndexScope value object (Parameter Object pattern).
 *
 * Immutable tenant scope threaded through the indexer so a request indexes its
 * OWN workspace and stamps its OWN project_id, instead of the fixed boot workspace.
 */

export interface IndexScope {
  /** Tenant identifier. Fail-closed: never empty in practice. */
  readonly projectId: string;
  /** Absolute path of the workspace to scan for this scope. */
  readonly workspace: string;
  /**
   * Human-readable name for project_registry.display_name. Derived from the
   * client's real workspace root (X-Workspace-Root), NOT the synthetic temp
   * scan directory — otherwise display_name degrades to the project_id.
   * Optional: falls back to the scan-workspace basename when absent.
   */
  readonly displayName?: string;
}

/** Build an IndexScope, falling back to boot config when a field is absent. */
export function resolveScope(
  scope: Partial<IndexScope> | undefined,
  fallback: IndexScope,
): IndexScope {
  return {
    projectId: scope?.projectId || fallback.projectId,
    workspace: scope?.workspace || fallback.workspace,
    displayName: scope?.displayName || fallback.displayName,
  };
}
