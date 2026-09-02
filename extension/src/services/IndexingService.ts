/**
 * IndexingService — Orchestrates workspace indexing by delegating to specialized indexers.
 * Each indexer (Schema, Document, PegaProject) is in its own file (≤200 LOC).
 */
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { IndexerHttpClient } from "./IndexerHttpClient";

export interface IndexOptions {
    code: boolean;
    documents: boolean;
    sync: boolean;
    schemas: boolean;
    jira: boolean;
}

export type ProgressReporter = vscode.Progress<{ message?: string }>;

export class IndexingService {
    private statusBarItem: vscode.StatusBarItem | null = null;
    /** Token refresh callback — set by caller to enable retry-on-401. */
    refreshTokenFn?: () => Promise<string | undefined>;
    /** Concurrency guard — prevents overlapping indexing operations. */
    private isProcessing = false;
    /** Current auth token — captured from indexWorkspace args (AuthManager/SecretStorage). */
    private token?: string;

    constructor(
        private readonly httpClient: IndexerHttpClient,
        private readonly outputChannel?: vscode.OutputChannel
    ) {}

    private log(msg: string): void {
        if (this.outputChannel) { this.outputChannel.appendLine(msg); }
        else { console.log(msg); }
    }

    /** Show indexing progress on status bar with file info and percentage. */
    private showProgress(message: string): void {
        if (!this.statusBarItem) {
            this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
            this.statusBarItem.show();
        }
        this.statusBarItem.text = `$(sync~spin) ${message}`;
        this.statusBarItem.tooltip = `Indexing in progress: ${message}`;
    }

    /** Hide indexing status bar item when done. */
    private hideProgress(): void {
        if (this.statusBarItem) {
            this.statusBarItem.dispose();
            this.statusBarItem = null;
        }
    }

    /** Build a human-readable label describing which tasks are selected. */
    private describeTasks(options: IndexOptions): string {
        const tasks: string[] = [];
        if (options.schemas) { tasks.push("Pega Rule Schema Generation"); }
        if (options.code) { tasks.push("Source Code Indexing"); }
        if (options.documents) { tasks.push("Document Indexing"); }
        if (options.sync) { tasks.push("Code Symbol Sync"); }
        if (options.jira) { tasks.push("Jira Project Indexing"); }
        if (tasks.length === 0) { return "Workspace Indexing"; }
        if (tasks.length === 1) { return tasks[0]; }
        return "Workspace Indexing";
    }

    async indexWorkspace(root: string, options: IndexOptions, token?: string, secrets?: vscode.SecretStorage): Promise<string[]> {
        // Concurrency guard: abort if already processing
        if (this.isProcessing) {
            vscode.window.showWarningMessage("⚠️ Indexing already in progress. Please wait for it to complete.");
            return ["⚠️ Aborted — indexing already in progress"];
        }
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
                if (options.schemas && secrets) {
                    this.showProgress("Generating Pega schemas...");
                    const summary = await this.runSchemaIndexer(root, report, secrets);
                    if (summary) { results.push(summary); }
                }

                // Pega project: rules ARE the code — detect and adjust behavior
                const isPegaProject = this.isPegaProject(root);

                if (options.code) {
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
                            const { getProjectId } = await import("../extension");
                            const projectId = getProjectId() || "PegaCollProj";
                            const syncResult = await this.httpClient.syncPegaRulesToKb(projectId, token);
                            results.push(syncResult.message);
                        }
                    } else {
                        this.showProgress("Scanning source code...");
                        report.report({ message: "Scanning and uploading source code files..." });
                        const res = await this.httpClient.uploadSourceFiles(
                            { report: (v) => { report.report(v); if (v.message) this.showProgress(v.message); } },
                            token,
                            this.refreshTokenFn,
                        );
                        results.push(res.summary);
                    }
                }
                if (options.documents) {
                    this.showProgress("Discovering documents...");
                    report.report({ message: "Discovering documents..." });
                    const { DocumentIndexer } = await import("./DocumentIndexer");
                    const docIndexer = new DocumentIndexer(this.httpClient);
                    results.push(await docIndexer.run(root,
                        { report: (v) => { report.report(v); if (v.message) this.showProgress(v.message); } },
                        token));
                }
                if (options.sync) {
                    if (isPegaProject) {
                        // SA4E-158: Pega sync now calls Phase 2 endpoint to sync indexed rules to KB
                        this.showProgress("Syncing Pega rules to KB...");
                        report.report({ message: "Syncing indexed Pega rules to KB + graph..." });
                        const { getProjectId } = await import("../extension");
                        const projectId = getProjectId() || "PegaCollProj";
                        const syncResult = await this.httpClient.syncPegaRulesToKb(projectId, token);
                        results.push(syncResult.message);
                    } else {
                        this.showProgress("Syncing code symbols to memory...");
                        report.report({ message: "Syncing code symbols to memory..." });
                        const syncResult = await this.httpClient.syncCodeSymbols();
                        results.push(syncResult
                            ? `✅ Code symbol sync: ${syncResult}`
                            : "⚠️ Code symbol sync failed — run manually via mem_sync_code");
                    }
                }
                if (options.jira && secrets) {
                    this.showProgress("Indexing Jira project...");
                    report.report({ message: "Indexing Jira project tickets..." });
                    const jiraSummary = await this.runJiraProjectIndexer(report, secrets, token);
                    results.push(jiraSummary);
                }
                this.hideProgress();
            }
        );
        // SA4E-101: Start polling backend TaskWorker progress for LLM analysis status bar
        this.pollTaskWorkerProgress();
        // Force immediate enrichment status poll to update KB status bar
        import("../extension").then(ext => ext.getEnrichmentService()?.pollNow()).catch(() => {});
        } finally {
            this.isProcessing = false;
        }
        return results;
    }

    /** SA4E-101: Poll backend TaskWorker progress and show on status bar until done. */
    private pollTaskWorkerProgress(): void {
        const backendUrl = this.httpClient.getBaseUrl();
        if (!backendUrl) return;
        const headersOf = (current: string | undefined): Record<string, string> =>
            current ? { "Authorization": `Bearer ${current}` } : {};
        const poll = async () => {
            try {
                let token = this.token;
                let res = await fetch(`${backendUrl}/api/admin/taskworker/progress`, { headers: headersOf(token) });
                if (res.status === 401 && this.refreshTokenFn) {
                    const fresh = await this.refreshTokenFn();
                    if (fresh) { token = fresh; res = await fetch(`${backendUrl}/api/admin/taskworker/progress`, { headers: headersOf(token) }); }
                }
                if (!res.ok) { this.hideProgress(); return; }
                const data = await res.json() as { active: boolean; file?: string; current?: number; total?: number; percent?: number };
                if (!data.active) { this.hideProgress(); return; }
                const fileName = data.file ? data.file.split('/').pop() || data.file : '';
                const detail = (typeof data.current === 'number' && typeof data.total === 'number')
                    ? ` (${data.current}/${data.total} — ${data.percent ?? 0}%)`
                    : '';
                this.showProgress(`Analyzing ${fileName}${detail}`);
                setTimeout(poll, 3000);
            } catch { this.hideProgress(); }
        };
        setTimeout(poll, 2000);
    }

    /** Delegate to PegaSchemaIndexer — batch generate all RuleForm schemas. */
    private async runSchemaIndexer(
        root: string, report: ProgressReporter, secrets: vscode.SecretStorage,
    ): Promise<string | null> {
        try {
            const config = vscode.workspace.getConfiguration("kiroSdlc");
            const username = config.get<string>("pegaUsername", "");
            const password = (await secrets.get("kiroSdlc.pegaPassword")) || "";
            if (!username || !password) {
                return "⚠️ Pega Schema: credentials not configured (set pegaUsername + password in settings)";
            }
            const { PegaHttpClient } = await import("./PegaHttpClient");
            const { PegaSchemaIndexer } = await import("./PegaSchemaIndexer");
            const pegaClient = new PegaHttpClient(secrets, this.outputChannel);
            const indexer = new PegaSchemaIndexer(this.httpClient, this.log.bind(this));
            return await indexer.run(root, report, pegaClient);
        } catch (err: any) {
            this.log(`[SchemaGen] ❌ Fatal error: ${err.message}`);
            return `❌ Pega Schema Generation Failed: ${err.message}`;
        }
    }

    /**
     * Delegate to Pega indexing. Fast path: Rule Catalog Export API (authoritative
     * rule list via CSV). Falls back to BFS crawl when catalog is disabled or fails.
     */
    private async runPegaProjectIndexer(
        root: string, report: ProgressReporter, secrets?: vscode.SecretStorage,
    ): Promise<string | null> {
        // Fast path: Rule Catalog Export (enabled by default; opt-out via setting).
        const useCatalog = vscode.workspace.getConfiguration("kiroSdlc")
            .get<boolean>("pega.useCatalogExport", true);
        if (useCatalog && secrets) {
            try {
                const { PegaCatalogIndexer } = await import("./PegaCatalogIndexer");
                const catalogIndexer = new PegaCatalogIndexer(this.httpClient, this.outputChannel, this.log.bind(this));
                const result = await catalogIndexer.run(root, report, secrets);
                if (result) {
                    return `🏛️ Pega (catalog): "${result.appName}" — ${result.catalogRules} rules in catalog, ingested ${result.totalIngested}`;
                }
                this.log("[Pega Indexer] ℹ️ Catalog export unavailable — falling back to BFS crawl.");
            } catch (err: any) {
                this.log(`[Pega Indexer] ⚠️ Catalog export failed (${err.message}) — falling back to BFS crawl.`);
            }
        }

        // Fallback path: BFS crawl (enumeration + relative discovery).
        try {
            const { PegaProjectIndexer } = await import("./PegaProjectIndexer");
            const indexer = new PegaProjectIndexer(this.httpClient, this.outputChannel, this.log.bind(this));
            return await indexer.run(root, report, secrets);
        } catch (err: any) {
            this.log(`[Pega Indexer] ❌ Fatal error: ${err.message}`);
            return `❌ Pega Project Indexing Failed: ${err.message}`;
        }
    }

    /** SA4E-230: Discover Pega service surface via CodeIntelligence API (best-effort). */
    private async runPegaCodeIntelDiscovery(
        root: string, report: ProgressReporter, secrets?: vscode.SecretStorage,
    ): Promise<string | null> {
        try {
            if (!secrets) return null;
            const { PegaHttpClient } = await import("./PegaHttpClient");
            const pegaClient = new PegaHttpClient(secrets, this.outputChannel);
            const { PegaCodeIntelDiscovery } = await import("./PegaCodeIntelDiscovery");
            const disc = new PegaCodeIntelDiscovery(pegaClient, this.outputChannel, this.log.bind(this));
            const { getProjectId } = await import("../extension");
            const projectId = getProjectId() || "PegaCollProj";
            return await disc.run({ root, report, projectId });
        } catch (err: any) {
            this.log(`[Pega Discovery] ⚠️ skipped: ${err.message}`);
            return `⚠️ Pega CodeIntelligence discovery skipped: ${err.message}`;
        }
    }

    /** Delegate to JiraProjectIndexer — fetch all Jira tickets and ingest into KB. */
    private async runJiraProjectIndexer(
        report: ProgressReporter, secrets: vscode.SecretStorage, token?: string,
    ): Promise<string> {
        try {
            const { JiraProjectIndexer } = await import("./JiraProjectIndexer");
            const indexer = new JiraProjectIndexer(this.httpClient, this.log.bind(this));
            return await indexer.run(report, secrets, token);
        } catch (err: any) {
            this.log(`[Jira Indexer] ❌ Fatal error: ${err.message}`);
            return `❌ Jira Project Indexing Failed: ${err.message}`;
        }
    }

    /** Check KB for existing Pega rule schemas (via backend mem_search). */
    private hasExistingSchemas(root: string): boolean {
        // Synchronous check: look for schema files on disk as quick proxy.
        // KB is the authoritative source, but sync check via HTTP is not possible here.
        // Schema gen will also ingest into KB, so next run will find them.
        const schemaDir = path.join(root, "schemas", "auto");
        try {
            const files = fs.readdirSync(schemaDir);
            return files.some((f: string) => f.endsWith(".json"));
        } catch { return false; }
    }

    /** Detect if workspace is a Pega project (has pega-project.json). */
    private isPegaProject(root: string): boolean {
        try { return fs.existsSync(path.join(root, "pega-project.json")); }
        catch { return false; }
    }
}