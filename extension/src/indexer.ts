/**
 * Workspace indexing — thin wrapper for backward compatibility.
 * Delegates to IndexingService class. Auto-detects Salesforce (SFDX) projects.
 */
import * as vscode from "vscode";
import { IndexingService, IndexOptions } from "./services/IndexingService";
import { IndexerHttpClient } from "./services/IndexerHttpClient";
import { detectSfdxProject, countSalesforceMetadata } from "./sf-indexer";
import { getBackendUrl, DEFAULT_BACKEND_URL } from "./config/backend-url";

export { IndexingService } from "./services/IndexingService";
export { IndexerHttpClient } from "./services/IndexerHttpClient";

/**
 * Resolve workspace root for indexing. Uses the already-configured target
 * workspace as the single source of truth, so multi-root workspaces do not
 * force the user to pick a folder that the backend already knows about.
 *
 * Resolution priority:
 *   1. CODE_INTEL_WORKSPACE env var (the workspace the backend/MCP was configured for)
 *   2. Domain project markers (pega-project.json > sfdx-project.json)
 *   3. Folder containing a `.code-intel/` directory (initialised project)
 *   4. Prompt the user only when the target is genuinely ambiguous
 */
async function getWorkspaceRoot(): Promise<string | undefined> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        vscode.window.showErrorMessage("No workspace folder open.");
        return undefined;
    }
    if (folders.length === 1) { return folders[0].uri.fsPath; }

    const fs = require('fs');
    const path = require('path');

    // 1. Configured workspace wins — matches what the backend/MCP already targets.
    const configuredRoot = process.env.CODE_INTEL_WORKSPACE?.trim();
    if (configuredRoot) {
        const normalize = (p: string) => path.resolve(p).toLowerCase();
        const match = folders.find(f => normalize(f.uri.fsPath) === normalize(configuredRoot));
        if (match) { return match.uri.fsPath; }
    }

    // 2. Domain-specific project markers.
    const domainMarkers = ['pega-project.json', 'sfdx-project.json'];
    for (const marker of domainMarkers) {
        const match = folders.find(f => fs.existsSync(path.join(f.uri.fsPath, marker)));
        if (match) { return match.uri.fsPath; }
    }

    // 3. Folder that has already been initialised for code intelligence.
    const initialised = folders.find(f => fs.existsSync(path.join(f.uri.fsPath, '.code-intel')));
    if (initialised) { return initialised.uri.fsPath; }

    // 4. Genuinely ambiguous — ask the user.
    const pick = await vscode.window.showQuickPick(
        folders.map(f => ({ label: path.basename(f.uri.fsPath), description: f.uri.fsPath, folder: f })),
        { placeHolder: "Select workspace folder to index" }
    );
    return pick?.folder.uri.fsPath;
}

let indexingOutputChannel: vscode.OutputChannel | undefined;

function getIndexingOutputChannel(): vscode.OutputChannel {
    if (!indexingOutputChannel) {
        indexingOutputChannel = vscode.window.createOutputChannel("SDLC Indexing");
    }
    return indexingOutputChannel;
}

function createService(tokenRefresher?: () => Promise<string | undefined>): IndexingService {
    let backendUrl: string;
    try {
        backendUrl = getBackendUrl();
    } catch (err: any) {
        console.warn(`[Security] backend.url validation failed at createService: ${err?.message} — falling back to loopback default`);
        backendUrl = DEFAULT_BACKEND_URL;
    }
    const client = new IndexerHttpClient(backendUrl);
    if (tokenRefresher) { client.setTokenRefresher(tokenRefresher); }
    const service = new IndexingService(client, getIndexingOutputChannel());
    // SA4E-300 GAP 4: wire the same refresher into the service so
    // pollTaskWorkerProgress can refresh (was never set before).
    if (tokenRefresher) { service.setRefreshTokenFn(tokenRefresher); }
    return service;
}

export async function promptIndexAfterInject(root: string, token?: string): Promise<void> {
    const action = await vscode.window.showInformationMessage(
        "🔍 Injection complete. Index your workspace now?", "Index Now", "Later"
    );
    if (action === "Index Now") { await runIndexWorkspace(root, token); }
}

export async function handleIndexWorkspace(token?: string, secrets?: vscode.SecretStorage, tokenRefresher?: () => Promise<string | undefined>): Promise<void> {
    const root = await getWorkspaceRoot();
    if (!root) { return; }
    await runIndexWorkspace(root, token, secrets, tokenRefresher);
}

async function runIndexWorkspace(root: string, token?: string, secrets?: vscode.SecretStorage, tokenRefresher?: () => Promise<string | undefined>): Promise<void> {
    const picks = await showIndexOptions();
    if (!picks || picks.length === 0) { return; }

    const options: IndexOptions = {
        code: picks.includes("code"),
        documents: picks.includes("documents"),
        sync: picks.includes("sync"),
        schemas: picks.includes("schemas"),
        jira: picks.includes("jira"),
    };

    const channel = getIndexingOutputChannel();
    channel.show(true);

    const service = createService(tokenRefresher);
    const results = await service.indexWorkspace(root, options, token, secrets);
    showIndexResults(results, picks, root, channel);
}

/** Build summary title matching selected operations. */
function describeSummaryTitle(options: string[]): string {
    if (options.length === 1) {
        switch (options[0]) {
            case "schemas": return "Pega Rule Schema Generation Summary";
            case "code": return "Source Code Indexing Summary";
            case "documents": return "Document Indexing Summary";
            case "sync": return "Code Symbol Sync Summary";
            case "jira": return "Jira Project Indexing Summary";
        }
    }
    return "Workspace Indexing Summary";
}

async function showIndexOptions(): Promise<string[] | undefined> {
    const root = await getWorkspaceRoot();
    const isPega = root ? require('fs').existsSync(require('path').join(root, 'pega-project.json')) : false;

    const items: Array<{ label: string; description: string; id: string; picked: boolean }> = [];
    items.push(
        { label: "$(code) Index Source Code", description: "Re-index all code symbols", id: "code", picked: true },
        { label: "$(book) Index Documents", description: "Index SDLC documents into KB", id: "documents", picked: true },
        { label: "$(sync) Sync Code → Memory", description: "Sync code entities into memory graph", id: "sync", picked: true },
        { label: "$(cloud-download) Index Jira Project", description: "Sync Jira tickets into KB", id: "jira", picked: false },
    );

    const picks = await vscode.window.showQuickPick(items, { canPickMany: true, placeHolder: "Select what to index" });
    return picks?.map(p => p.id);
}

function showIndexResults(results: string[], options: string[], root: string, channel: vscode.OutputChannel): void {
    const summaryTitle = describeSummaryTitle(options);
    channel.appendLine(`\n=== ${summaryTitle} ===\n`);

    // Auto-detect Salesforce project and show SF-specific summary
    const sfdxRoot = detectSfdxProject(root);
    if (sfdxRoot) {
        const sfCounts = countSalesforceMetadata(sfdxRoot);
        channel.appendLine("🌩️ Salesforce Project Detected\n");
        const parts: string[] = [];
        if (sfCounts.apexClasses > 0) { parts.push(`  Apex classes: ${sfCounts.apexClasses}`); }
        if (sfCounts.triggers > 0) { parts.push(`  Triggers: ${sfCounts.triggers}`); }
        if (sfCounts.flows > 0) { parts.push(`  Flows: ${sfCounts.flows}`); }
        if (sfCounts.objects > 0) { parts.push(`  Objects: ${sfCounts.objects}`); }
        if (sfCounts.lwc > 0) { parts.push(`  LWC components: ${sfCounts.lwc}`); }
        if (parts.length > 0) { channel.appendLine(parts.join("\n")); }
        channel.appendLine(`  Total SF components: ${sfCounts.total}\n`);
    }

    channel.appendLine(results.join("\n"));
    channel.appendLine("\n--- Next Steps ---");
    if (options.includes("code")) { channel.appendLine("• Code: MCP server indexes automatically."); }
    if (options.includes("documents")) { channel.appendLine("• Documents: Indexed via HTTP API."); }
    if (options.includes("sync")) { channel.appendLine("• Sync: Code symbols synced to KB automatically."); }
    if (options.includes("jira")) { channel.appendLine("• Jira: Project tickets ingested into KB for agent context."); }
    vscode.window.showInformationMessage("📋 Indexing complete — see Output panel.", "Open Output")
        .then(action => { if (action === "Open Output") { channel.show(); } });
}
