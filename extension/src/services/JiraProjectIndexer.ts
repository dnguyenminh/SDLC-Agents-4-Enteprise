/**
 * SA4E-102 — JiraProjectIndexer: Orchestrates deep Jira project sync into KB.
 * Delegates to jira-sync/ modules: LinkCrawler, KbEntryBuilder, SyncState.
 * Prompts and KB ingestion live in ./JiraProjectIndexer/*.
 */
import * as vscode from "vscode";
import { AtlassianHttpClient } from "../mcp/atlassian/atlassian-http-client";
import { AtlassianCredentialService } from "./AtlassianCredentialService";
import type { IndexerHttpClient } from "./IndexerHttpClient";
import { LinkCrawler, buildKbEntries, getSyncState, saveSyncState, buildIncrementalJql, isFullSync, nowIso, AttachmentFetcher, type CrawledIssue } from "./jira-sync";
import type { KbEntry } from "./jira-sync";
import { getEffectiveScope } from "../utils/scope-detector";
import { promptProjectKey, askSyncMode } from "./JiraProjectIndexer/prompt";
import { ingestEntries } from "./JiraProjectIndexer/ingest";

type ProgressReporter = vscode.Progress<{ message?: string }>;

const PAGE_SIZE = 50;

export class JiraProjectIndexer {
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
        const projectKey = await promptProjectKey(secrets);
        if (!projectKey) { return "ℹ️ Jira Project Index: cancelled by user"; }

        const credService = new AtlassianCredentialService(secrets);
        const config = await credService.getConfig();
        if (!config) {
            return "⚠️ Jira Project Index: Atlassian credentials not configured (Settings → Atlassian Connection)";
        }

        const client = new AtlassianHttpClient(credService);
        const syncState = getSyncState(projectKey);
        const forceFullSync = await askSyncMode(syncState);
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
        const { entries, attachmentCount, attachmentSkipped } =
            await this.processAttachments(client, allIssues, projectKey, token, report);

        // Phase 4: Build KB entries (3 per ticket)
        report.report({ message: `Building KB entries for ${allIssues.length} issues...` });
        for (const issue of allIssues) { entries.push(...buildKbEntries(issue, projectKey)); }

        // Phase 5: Ingest into KB
        report.report({ message: `Ingesting ${entries.length} KB entries...` });
        const ingested = await ingestEntries(this.httpClient, entries, token, report);

        // Phase 6: Save sync state
        await saveSyncState(projectKey, {
            lastSyncDate: nowIso(),
            totalIssues: primaryKeys.length,
            lastFullSync: fullSync ? nowIso() : syncState.lastFullSync,
        });

        return this.buildSummary(projectKey, primaryKeys.length, allIssues.length, entries.length, ingested, fullSync, attachmentCount, attachmentSkipped);
    }

    /** Phase 3: attachment fetch + KB entry building for primary tickets (depth=0). */
    private async processAttachments(
        client: AtlassianHttpClient,
        allIssues: CrawledIssue[],
        projectKey: string,
        token: string | undefined,
        report: ProgressReporter,
    ): Promise<{ entries: KbEntry[]; attachmentCount: number; attachmentSkipped: number }> {
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
        return { entries, attachmentCount, attachmentSkipped };
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
