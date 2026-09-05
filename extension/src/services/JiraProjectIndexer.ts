/**
 * SA4E-102 — JiraProjectIndexer: Orchestrates deep Jira project sync into KB.
 * Delegates to jira-sync/ modules: LinkCrawler, KbEntryBuilder, SyncState.
 */
import * as vscode from "vscode";
import { AtlassianHttpClient } from "../mcp/atlassian/atlassian-http-client";
import { AtlassianCredentialService } from "./AtlassianCredentialService";
import type { IndexerHttpClient } from "./IndexerHttpClient";
import { LinkCrawler, buildKbEntries, getSyncState, saveSyncState, buildIncrementalJql, isFullSync, nowIso, AttachmentFetcher } from "./jira-sync";
import type { KbEntry } from "./jira-sync";
import { getEffectiveScope } from "../utils/scope-detector";

type ProgressReporter = vscode.Progress<{ message?: string }>;

const PAGE_SIZE = 50;

export class JiraProjectIndexer {
    private secrets: vscode.SecretStorage | undefined;

    constructor(
        private readonly httpClient: IndexerHttpClient,
        private readonly log: (msg: string) => void,
    ) {}

    /** Main entry: prompt project key, crawl, ingest into KB. */
    async run(
        report: ProgressReporter,
        secrets: vscode.SecretStorage,
        token?: string,
    ): Promise<string> {
        this.secrets = secrets;
        const projectKey = await this.promptProjectKey();
        if (!projectKey) { return "ℹ️ Jira Project Index: cancelled by user"; }

        const credService = new AtlassianCredentialService(secrets);
        const config = await credService.getConfig();
        if (!config) {
            return "⚠️ Jira Project Index: Atlassian credentials not configured (Settings → Atlassian Connection)";
        }

        const client = new AtlassianHttpClient(credService);
        const syncState = getSyncState(projectKey);
        const forceFullSync = await this.askSyncMode(syncState);
        const fullSync = isFullSync(syncState, forceFullSync);
        const jql = forceFullSync
            ? `project = ${projectKey} ORDER BY key ASC`
            : buildIncrementalJql(projectKey, syncState);

        this.log(`[JiraProjectIndexer] ${fullSync ? "Full" : "Incremental"} sync for ${projectKey}`);
        report.report({ message: `${fullSync ? "Full" : "Incremental"} sync: ${projectKey}...` });

        // Phase 1: Fetch primary issue keys via JQL
        const primaryKeys = await this.fetchProjectKeys(client, jql, report);
        if (primaryKeys.length === 0) {
            return `ℹ️ Jira Project Index: No ${fullSync ? "" : "updated "}issues found in ${projectKey}`;
        }

        // Phase 2: Deep crawl (links, comments, attachments metadata)
        this.log(`[JiraProjectIndexer] Crawling ${primaryKeys.length} issues (+ linked)...`);
        const crawler = new LinkCrawler(client, this.log);
        await crawler.crawlBatch(primaryKeys, (done, total) => {
            report.report({ message: `Crawling ${done}/${total} issues (${crawler.getVisitedKeys().size} total visited)...` });
        });

        const allIssues = crawler.getResults();
        this.log(`[JiraProjectIndexer] Crawled ${allIssues.length} issues total (${primaryKeys.length} primary + linked)`);

        // Phase 3: Process attachments for primary tickets (depth=0)
        const entries: KbEntry[] = [];
        let attachmentCount = 0;
        let attachmentSkipped = 0;
        const primaryIssues = allIssues.filter(i => i.depth === 0 && i.attachments.length > 0);
        if (primaryIssues.length > 0) {
            report.report({ message: `Processing attachments for ${primaryIssues.length} issues...` });
            const attFetcher = new AttachmentFetcher(client, this.httpClient.getBaseUrl(), this.log);
            for (const issue of primaryIssues) {
                const fetched = await attFetcher.processAttachments(issue.key, issue.attachments, token);
                attachmentCount += fetched.length;
                for (const att of fetched) {
                    entries.push({
                        content: `JIRA_ATTACHMENT | key=${issue.key} | file=${att.filename} | converted=${att.converted}\n\n${att.content.slice(0, 4000)}`,
                        summary: `${issue.key}: attachment ${att.filename}`,
                        type: "CONTEXT",
                        scope: getEffectiveScope(),
                        source: `jira/${projectKey}/${issue.key}/attachment/${att.filename}`,
                        tags: `jira,${projectKey},attachment,${issue.key}`,
                    });
                }
            }
            attachmentSkipped = attFetcher.skipped;
        }

        // Phase 4: Build KB entries (3 per ticket)
        report.report({ message: `Building KB entries for ${allIssues.length} issues...` });
        for (const issue of allIssues) { entries.push(...buildKbEntries(issue, projectKey)); }

        // Phase 5: Ingest into KB
        report.report({ message: `Ingesting ${entries.length} KB entries...` });
        const ingested = await this.ingestEntries(entries, token, report);

        // Phase 6: Save sync state
        await saveSyncState(projectKey, {
            lastSyncDate: nowIso(),
            totalIssues: primaryKeys.length,
            lastFullSync: fullSync ? nowIso() : syncState.lastFullSync,
        });

        return this.buildSummary(projectKey, primaryKeys.length, allIssues.length, entries.length, ingested, fullSync, attachmentCount, attachmentSkipped);
    }

    /** Ask user for Jira project key — shows QuickPick with projects from Jira API. */
    private async promptProjectKey(): Promise<string | undefined> {
        const lastKey = this.getLastProjectKey();
        const items = await this.fetchProjectList();
        if (items.length === 0) {
            return this.fallbackInputBox(lastKey);
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
        await this.saveLastProjectKey(key);
        return key;
    }

    /** Fetch projects from Jira for QuickPick list. */
    private async fetchProjectList(): Promise<vscode.QuickPickItem[]> {
        try {
            const credService = new AtlassianCredentialService(this.secrets!);
            const client = new AtlassianHttpClient(credService);
            const res = await client.request("GET", "/rest/api/2/project");
            const projects = res.data as Array<{ key: string; name: string }>;
            return projects.map(p => ({ label: `${p.key} — ${p.name}`, description: p.key }));
        } catch {
            return [];
        }
    }

    /** Fallback text input if API unavailable. */
    private async fallbackInputBox(lastKey?: string): Promise<string | undefined> {
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
    private getLastProjectKey(): string | undefined {
        return vscode.workspace.getConfiguration("kiroSdlc").get<string>("jiraLastProject");
    }

    /** Persist last used project key. */
    private async saveLastProjectKey(key: string): Promise<void> {
        await vscode.workspace.getConfiguration("kiroSdlc")
            .update("jiraLastProject", key, vscode.ConfigurationTarget.Workspace);
    }

    /** Ask user: incremental or full sync? Shows only if previous sync exists. */
    private async askSyncMode(state: { lastSyncDate: string | null }): Promise<boolean> {
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

    /** Paginated fetch of all project issue keys via JQL (token-based pagination). */
    private async fetchProjectKeys(
        client: AtlassianHttpClient, jql: string, report: ProgressReporter,
    ): Promise<string[]> {
        const keys: string[] = [];
        let nextPageToken: string | undefined;
        let isLast = false;

        while (!isLast) {
            try {
                const params = new URLSearchParams({ jql, maxResults: String(PAGE_SIZE), fields: "key" });
                if (nextPageToken) { params.set("nextPageToken", nextPageToken); }
                const res = await client.request("GET", `/rest/api/3/search/jql?${params}`);
                const data = res.data as any;
                const issues: any[] = data.issues ?? [];
                for (const issue of issues) { keys.push(issue.key); }
                isLast = data.isLast === true || issues.length === 0;
                nextPageToken = data.nextPageToken;
                report.report({ message: `Discovered ${keys.length} issues...` });
            } catch (err: any) {
                this.log(`[JiraProjectIndexer] ❌ JQL fetch error: ${err.message}`);
                break;
            }
        }

        return keys;
    }

    /** Ingest KB entries via backend API. */
    private async ingestEntries(entries: KbEntry[], token?: string, report?: ProgressReporter): Promise<number> {
        const backendUrl = this.httpClient.getBaseUrl();
        const url = `${backendUrl}/api/v1/memory/ingest`;
        let ingested = 0;

        for (let i = 0; i < entries.length; i++) {
            if (i % 20 === 0 && report) {
                report.report({ message: `Ingesting ${i + 1}/${entries.length} entries...` });
            }
            try {
                const ok = await this.httpPost(url, entries[i], token);
                if (ok) { ingested++; }
            } catch {
                // Non-fatal: log and continue
            }
        }

        return ingested;
    }

    /** HTTP POST to backend. */
    private async httpPost(url: string, payload: unknown, token?: string): Promise<boolean> {
        const http = await import("http");
        const body = JSON.stringify(payload);
        const parsedUrl = new URL(url);
        const { getProjectId } = await import("../extension");

        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body).toString(),
        };
        if (token) { headers["Authorization"] = `Bearer ${token}`; }
        const pid = getProjectId();
        if (pid) { headers["X-Project-Id"] = pid; }

        return new Promise((resolve) => {
            const req = http.default.request(
                { hostname: parsedUrl.hostname, port: parsedUrl.port || undefined, path: parsedUrl.pathname, method: "POST", headers },
                (res) => {
                    let data = "";
                    res.on("data", (chunk: any) => { data += chunk; });
                    res.on("end", () => resolve(res.statusCode === 200 || res.statusCode === 201));
                },
            );
            req.on("error", () => resolve(false));
            req.setTimeout(15000, () => { req.destroy(); resolve(false); });
            req.write(body);
            req.end();
        });
    }

    private buildSummary(
        projectKey: string, primary: number, total: number,
        entries: number, ingested: number, fullSync: boolean, attachments: number, attachmentsSkipped: number,
    ): string {
        const lines = [
            `✅ Jira Project Index: ${projectKey} (${fullSync ? "full" : "incremental"})`,
            `   📋 Primary issues: ${primary}`,
            `   🔗 Total crawled (+ linked): ${total}`,
            `   📎 Attachments processed: ${attachments}${attachmentsSkipped > 0 ? ` (${attachmentsSkipped} skipped — unchanged)` : ""}`,
            `   📦 KB entries created: ${ingested}/${entries}`,
        ];
        if (ingested < entries) { lines.push(`   ⚠️ Failed: ${entries - ingested}`); }
        return lines.join("\n");
    }
}
