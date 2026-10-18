/**
 * IndexingService — public orchestrator of the IndexingService/* chain.
 * indexWorkspace sequences the specialized indexers behind a progress dialog.
 */

import * as vscode from "vscode";
import { IndexerHttpClient } from "../IndexerHttpClient";
import type { IndexOptions, ProgressReporter } from "./types";
import { IndexingServiceDelegates } from "./delegates";

export class IndexingService extends IndexingServiceDelegates {
    async indexWorkspace(root: string, options: IndexOptions, token?: string, secrets?: vscode.SecretStorage): Promise<string[]> {
        // Concurrency guard: abort if already processing
        const aborted = this.abortResultIfBusy();
        if (aborted) { return aborted; }
        this.isProcessing = true;
        this.token = token;
        const results: string[] = [];

        try {

        // SA4E-214: Schema generation removed as separate step — now on-the-fly during BFS indexing
        // (Legacy auto-enable disabled)

        if (this.outputChannel) {
            this.outputChannel.show(true);
            this.outputChannel.appendLine(`=== ${this.describeTasks(options)} Started ===\n`);
        }

        await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: "SDLC Agents", cancellable: false },
            async (report) => {
                await this.runIndexTasks(root, options, report, token, secrets, results);
            }
        );
        // SA4E-101: Start polling backend TaskWorker progress for LLM analysis status bar
        this.pollTaskWorkerProgress();
        // Force immediate enrichment status poll to update KB status bar
        import("../../extension").then(ext => ext.getEnrichmentService()?.pollNow()).catch(() => {});
        } finally {
            this.isProcessing = false;
        }
        return results;
    }

    /** Guard message shown when an indexing run is already in flight. */
    private abortResultIfBusy(): string[] | null {
        if (!this.isProcessing) { return null; }
        vscode.window.showWarningMessage("⚠️ Indexing already in progress. Please wait for it to complete.");
        // SA4E-300 GAP 4: leave a trace in the centralized Output log as well
        const busyMsg = "[IndexingService] Indexing already in progress — request ignored";
        if (this.outputChannel) {
            this.outputChannel.appendLine(busyMsg);
        } else {
            IndexerHttpClient.getIndexerOutput().appendLine(busyMsg);
        }
        return ["⚠️ Aborted — indexing already in progress"];
    }

    /** Sequential task runner executed inside the withProgress callback. */
    private async runIndexTasks(
        root: string, options: IndexOptions, report: ProgressReporter,
        token: string | undefined, secrets: vscode.SecretStorage | undefined, results: string[],
    ): Promise<void> {
        if (options.schemas && secrets) {
            this.showProgress("Generating Pega schemas...");
            const summary = await this.runSchemaIndexer(root, report, secrets);
            if (summary) { results.push(summary); }
        }

        // Pega project: rules ARE the code — detect and adjust behavior
        const isPegaProject = this.isPegaProject(root);

        if (options.code) {
            await this.runCodeIndexing(root, options, report, secrets, token, results, isPegaProject);
        }
        if (options.documents) {
            this.showProgress("Discovering documents...");
            report.report({ message: "Discovering documents..." });
            const { DocumentIndexer } = await import("../DocumentIndexer");
            const docIndexer = new DocumentIndexer(this.httpClient);
            // Notification only — same dedup rationale as source upload above.
            results.push(await docIndexer.run(root,
                { report: (v) => { report.report(v); } },
                token));
        }
        if (options.sync) {
            await this.runSyncIndexing(report, token, results, isPegaProject);
        }
        if (options.jira && secrets) {
            this.showProgress("Indexing Jira project...");
            report.report({ message: "Indexing Jira project tickets..." });
            const jiraSummary = await this.runJiraProjectIndexer(report, secrets, token);
            results.push(jiraSummary);
        }
        this.hideProgress();
    }

    /** options.code block — Pega rules via indexers, or plain source upload. */
    private async runCodeIndexing(
        root: string, options: IndexOptions, report: ProgressReporter,
        secrets: vscode.SecretStorage | undefined, token: string | undefined,
        results: string[], isPegaProject: boolean,
    ): Promise<void> {
        if (isPegaProject) {
            // Pega: download rules from server = indexing source code
            this.showProgress("Indexing Pega project rules...");
            const pegaSummary = await this.runPegaProjectIndexer(root, report, secrets);
            if (pegaSummary) { results.push(pegaSummary); }
            // SA4E-230: Also surface the service surface via CodeIntelligence discovery
            const discoverySummary = await this.runPegaCodeIntelDiscovery(root, report, secrets);
            if (discoverySummary) { results.push(discoverySummary); }
            // Auto-sync to symbols table after Pega indexing (Phase 2)
            if (!options.sync) {
                this.showProgress("Auto-syncing Pega rules to symbols...");
                report.report({ message: "Auto-syncing indexed Pega rules to symbols + enrichment..." });
                const { requireProjectId } = await import("../../extension");
                const projectId = requireProjectId();
                const syncResult = await this.httpClient.syncPegaRulesToKb(projectId, token);
                results.push(syncResult.message);
            }
        } else {
            this.showProgress("Scanning source code...");
            report.report({ message: "Scanning and uploading source code files..." });
            // Notification only — the manual status bar is reserved for
            // post-withProgress phases (pollTaskWorkerProgress).
            const res = await this.httpClient.uploadSourceFiles(
                { report: (v) => { report.report(v); } },
                token,
                undefined,
            );
            results.push(res.summary);
        }
    }

    /** options.sync block — Pega KB sync or code symbol sync. */
    private async runSyncIndexing(
        report: ProgressReporter, token: string | undefined, results: string[], isPegaProject: boolean,
    ): Promise<void> {
        if (isPegaProject) {
            // SA4E-158: Pega sync now calls Phase 2 endpoint to sync indexed rules to KB
            this.showProgress("Syncing Pega rules to KB...");
            report.report({ message: "Syncing indexed Pega rules to KB + graph..." });
            const { requireProjectId } = await import("../../extension");
            const projectId = requireProjectId();
            const syncResult = await this.httpClient.syncPegaRulesToKb(projectId, token);
            results.push(syncResult.message);
        } else {
            this.showProgress("Syncing code symbols to memory...");
            report.report({ message: "Syncing code symbols to memory..." });
            const syncResult = await this.httpClient.syncCodeSymbols();
            if (syncResult) {
                results.push(`✅ Code symbol sync: ${syncResult}`);
            } else {
                const channel = IndexerHttpClient.getIndexerOutput();
                channel.appendLine(`Code symbol sync failed`);
                results.push("⚠️ Code symbol sync failed — run manually via mem_sync_code");
            }
        }
    }
}
