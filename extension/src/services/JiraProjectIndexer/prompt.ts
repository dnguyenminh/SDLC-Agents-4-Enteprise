/**
 * Jira project selection + sync-mode prompts (SA4E-102).
 * QuickPick over the Jira project list, last-key persistence, sync mode choice.
 */

import * as vscode from "vscode";
import { AtlassianHttpClient } from "../../mcp/atlassian/atlassian-http-client";
import { AtlassianCredentialService } from "../AtlassianCredentialService";

/** Ask user for Jira project key — shows QuickPick with projects from Jira API. */
export async function promptProjectKey(secrets: vscode.SecretStorage): Promise<string | undefined> {
    const lastKey = getLastProjectKey();
    const items = await fetchProjectList(secrets);
    if (items.length === 0) {
        return fallbackInputBox(lastKey);
    }
    // Pre-select last used project if available
    if (lastKey) {
        const lastItem = items.find(i => i.description === lastKey);
        if (lastItem) {
            items.splice(items.indexOf(lastItem), 1);
            items.unshift(lastItem);
        }
    }
    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: lastKey ? `Last used: ${lastKey}` : "Select Jira project",
        title: "Jira Project Indexing — Select Project",
    });
    if (!selected) { return undefined; }
    const key = selected.description!;
    await saveLastProjectKey(key);
    return key;
}

/** Fetch projects from Jira for QuickPick list. */
async function fetchProjectList(secrets: vscode.SecretStorage): Promise<vscode.QuickPickItem[]> {
    try {
        const credService = new AtlassianCredentialService(secrets);
        const client = new AtlassianHttpClient(credService);
        const res = await client.request("GET", "/rest/api/2/project");
        const projects = res.data as Array<{ key: string; name: string }>;
        return projects.map(p => ({ label: `${p.key} — ${p.name}`, description: p.key }));
    } catch {
        return [];
    }
}

/** Fallback text input if API unavailable. */
async function fallbackInputBox(lastKey?: string): Promise<string | undefined> {
    const v = await vscode.window.showInputBox({
        prompt: "Enter Jira Project Key (API unavailable for list)",
        placeHolder: lastKey || "PROJECT_KEY",
        value: lastKey || "",
        validateInput: (v) => /^[A-Z][A-Z0-9_-]{1,10}$/.test(v.trim().toUpperCase())
            ? null : "Must be 2-11 uppercase letters/digits",
    });
    return v?.trim().toUpperCase();
}

/** Read last used project key from workspace config. */
function getLastProjectKey(): string | undefined {
    return vscode.workspace.getConfiguration("sdlcAgents").get<string>("jiraLastProject");
}

/** Persist last used project key. */
async function saveLastProjectKey(key: string): Promise<void> {
    await vscode.workspace.getConfiguration("sdlcAgents")
        .update("jiraLastProject", key, vscode.ConfigurationTarget.Workspace);
}

/** Ask user: incremental or full sync? Shows only if previous sync exists. */
export async function askSyncMode(state: { lastSyncDate: string | null }): Promise<boolean> {
    if (!state.lastSyncDate) { return true; } // No prior sync → always full
    const choice = await vscode.window.showQuickPick(
        [
            { label: "Full Sync", description: "Re-index all issues from scratch", value: true },
            { label: "Incremental", description: `Only issues updated since ${state.lastSyncDate}`, value: false },
        ],
        { title: "Sync Mode", placeHolder: "Choose sync mode" }
    );
    return choice?.value ?? false;
}
