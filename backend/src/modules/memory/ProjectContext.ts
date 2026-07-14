/**
 * ProjectContext — immutable session-level context for scope enforcement.
 * Types + factory function. Frozen after creation (BR-06).
 */

export interface ProjectContext {
  readonly projectId: string;
  readonly userId: string;
  readonly workspaceId?: string;
  readonly sessionId?: string;
  readonly createdAt: string;
}

export interface ScopeFilter {
  readonly clause: string;
  readonly params: readonly unknown[];
}

export interface WriteDecorator {
  readonly project_id: string | null;
}

export interface MutationValidation {
  readonly allowed: boolean;
  readonly reason?: string;
}

export function createProjectContext(
  projectId: string,
  userId: string,
  sessionId?: string,
  workspaceId?: string,
): ProjectContext {
  return Object.freeze({
    projectId,
    userId,
    workspaceId,
    sessionId,
    createdAt: new Date().toISOString(),
  });
}
