/**
 * Workspace indexing — thin wrapper for backward compatibility.
 * Delegates to IndexingService class. Auto-detects Salesforce (SFDX) projects.
 */
import * as vscode from "vscode";
import { IndexingService, IndexOptions } from "./services/IndexingService";
import { IndexerHttpClient } from "./services/IndexerHttpClient";
import { detectSfdxProject, countSalesforceMetadata } from "./sf-indexer";

export { IndexingService } from "./services/IndexingService";
export { IndexerHttpClient } from "./services/IndexerHttpClient";

function getBackendUrl(): string {
    return vscode.workspace.getConfiguration("kiroSdlc").get<string>("backend.url") || "http://127.0.0.1:48721";
}

function getWorkspaceRoot(): string | undefined {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) { vscode.window.showErrorMessage("No workspace folder open."); return undefined; }
    return folders[0].uri.fsPath;
}

function createService(): IndexingService {
    return new IndexingService(new IndexerHttpClient(getBackendUrl()));
}

export async function promptIndexAfterInject(root: string, token?: string): Promise<void> {
    const action = await vscode.window.showInformationMessage(
        "🔍 Injection complete. Index your workspace now?", "Index Now", "Later"
    );
    if (action === "Index Now") { await runIndexWorkspace(root, token); }
}

export async function handleIndexWorkspace(token?: string): Promise<void> {
    const root = getWorkspaceRoot();
    if (!root) { return; }
    await runIndexWorkspace(root, token);
}

async function runIndexWorkspace(root: string, token?: string): Promise<void> {
    const picks = await showIndexOptions();
    if (!picks || picks.length === 0) { return; }

    const options: IndexOptions = {
        code: picks.includes("code"),
        documents: picks.includes("documents"),
        sync: picks.includes("sync"),
    };

    const service = createService();
    const results = await service.indexWorkspace(root, options, token);
    showIndexResults(results, picks, root);
}

async function showIndexOptions(): Promise<string[] | undefined> {
    const picks = await vscode.window.showQuickPick([
        { label: "$(code) Index Source Code", description: "Re-index all code symbols", id: "code", picked: true },
        { label: "$(book) Index Documents", description: "Index SDLC documents into KB", id: "documents", picked: true },
        { label: "$(sync) Sync Code → Memory", description: "Sync code entities into memory graph", id: "sync", picked: true }
    ], { canPickMany: true, placeHolder: "Select what to index" });
    return picks?.map(p => p.id);
}

function showIndexResults(results: string[], options: string[], root: string): void {
    const channel = vscode.window.createOutputChannel("SDLC Indexing");
    channel.show();
    channel.appendLine("=== Workspace Indexing Results ===\n");

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
    if (options.includes("sync")) { channel.appendLine("• Sync: Ask agent to run mem_sync_code"); }
    vscode.window.showInformationMessage("📋 Indexing complete — see Output panel.", "Open Output")
        .then(action => { if (action === "Open Output") { channel.show(); } });
}
