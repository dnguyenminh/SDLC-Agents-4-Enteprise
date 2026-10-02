/**
 * SA4E-102 — SyncState: Tracks last sync date for incremental Jira project sync.
 * Persists state in VS Code workspace configuration.
 */
import * as vscode from "vscode";

/** Sync state per project key */
export interface ProjectSyncState {
    lastSyncDate: string | null;
    totalIssues: number;
    lastFullSync: string | null;
}

const CONFIG_KEY = "sdlcAgents.jiraSyncState";

/**
 * Read sync state for a project key from workspace config.
 * @param projectKey Jira project key
 * @returns Sync state or default (no previous sync)
 */
export function getSyncState(projectKey: string): ProjectSyncState {
    const config = vscode.workspace.getConfiguration();
    const allStates = config.get<Record<string, ProjectSyncState>>(CONFIG_KEY, {});
    return allStates[projectKey] || { lastSyncDate: null, totalIssues: 0, lastFullSync: null };
}

/**
 * Save sync state after successful sync.
 * @param projectKey Jira project key
 * @param state Updated sync state
 */
export async function saveSyncState(projectKey: string, state: ProjectSyncState): Promise<void> {
    const config = vscode.workspace.getConfiguration();
    const allStates = config.get<Record<string, ProjectSyncState>>(CONFIG_KEY, {});
    allStates[projectKey] = state;
    await config.update(CONFIG_KEY, allStates, vscode.ConfigurationTarget.Workspace);
}

/**
 * Build JQL for incremental sync (only updated tickets).
 * @param projectKey Jira project key
 * @param state Current sync state
 * @returns JQL string
 */
export function buildIncrementalJql(projectKey: string, state: ProjectSyncState): string {
    if (!state.lastSyncDate) {
        return `project = ${projectKey} ORDER BY key ASC`;
    }
    return `project = ${projectKey} AND updated >= "${state.lastSyncDate}" ORDER BY key ASC`;
}

/**
 * Check if this is a full sync (first time or forced).
 * @param state Current sync state
 * @param forceFullSync User requested full re-sync
 */
export function isFullSync(state: ProjectSyncState, forceFullSync: boolean): boolean {
    return !state.lastSyncDate || forceFullSync;
}

/** Get current ISO timestamp for sync state tracking. */
export function nowIso(): string {
    return new Date().toISOString().slice(0, 19).replace("T", " ");
}
