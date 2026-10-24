/**
 * IndexingServiceDelegates — specialized indexer runners for IndexingService.
 * Each delegate wraps one indexer so indexWorkspace stays a thin orchestrator.
 */

import * as vscode from "vscode";
import { ensureMigrated, getWsHash, secretKey, LEGACY_SECRET } from "../WorkspaceScopeResolver";
import type { ProgressReporter } from "./types";
import { IndexingServiceBase } from "./base";
import { getSetting } from "../../config/settings-migration";

export class IndexingServiceDelegates extends IndexingServiceBase {
    /** Delegate to PegaSchemaIndexer — batch generate all RuleForm schemas. */
    protected async runSchemaIndexer(
        root: string, report: ProgressReporter, secrets: vscode.SecretStorage,
    ): Promise<string | null> {
        try {
            await ensureMigrated(secrets);
            const username = getSetting<string>("pega.username", ""pega.username", "");
            const wsHash = getWsHash();
            const pwKey = wsHash ? secretKey("pega", wsHash)! : LEGACY_SECRET.pega;
            const password = (await secrets.get(pwKey)) || "";
            if (!username || !password) {
                return "⚠️ Pega Schema: credentials not configured (set pega.username + password in settings)";
            }
            const { PegaHttpClient } = await import("../PegaHttpClient");
            const { PegaSchemaIndexer } = await import("../PegaSchemaIndexer");
            const pegaClient = new PegaHttpClient(secrets, this.outputChannel);
            // SA4E-362 FR-7 (SHOULD): SchemaIndexer nhận provider (Authorization + refresh-on-401)
            const indexer = new PegaSchemaIndexer(this.httpClient, this.log.bind(this), this.ingestAuthProvider());
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
    protected async runPegaProjectIndexer(
        root: string, report: ProgressReporter, secrets?: vscode.SecretStorage,
    ): Promise<string | null> {
        // Fast path: Rule Catalog Export (enabled by default; opt-out via setting).
        const useCatalog = getSetting<boolean>("pega.useCatalogExport", "pega.useCatalogExport", true);
        if (useCatalog && secrets) {
            try {
                const { PegaCatalogIndexer } = await import("../PegaCatalogIndexer");
                const catalogIndexer = new PegaCatalogIndexer(this.httpClient, this.outputChannel, this.log.bind(this), this.ingestAuthProvider());
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
            const { PegaProjectIndexer } = await import("../PegaProjectIndexer");
            const indexer = new PegaProjectIndexer(this.httpClient, this.outputChannel, this.log.bind(this), this.ingestAuthProvider());
            return await indexer.run(root, report, secrets);
        } catch (err: any) {
            this.log(`[Pega Indexer] ❌ Fatal error: ${err.message}`);
            return `❌ Pega Project Indexing Failed: ${err.message}`;
        }
    }

    /** SA4E-230: Discover Pega service surface via CodeIntelligence API (best-effort). */
    protected async runPegaCodeIntelDiscovery(
        root: string, report: ProgressReporter, secrets?: vscode.SecretStorage,
    ): Promise<string | null> {
        try {
            if (!secrets) return null;
            const { PegaHttpClient } = await import("../PegaHttpClient");
            const pegaClient = new PegaHttpClient(secrets, this.outputChannel);
            const { PegaCodeIntelDiscovery } = await import("../PegaCodeIntelDiscovery");
            // SA4E-362 FR-7 (SHOULD): Discovery nhận provider (refresh-on-401)
            const disc = new PegaCodeIntelDiscovery(pegaClient, this.outputChannel, this.log.bind(this), this.ingestAuthProvider());
            const { getProjectId } = await import("../../extension");
            const projectId = getProjectId();
            if (!projectId) {
                // SA4E-241 SEC-01: no shared-default project — skip if unresolved.
                return "⚠️ Pega CodeIntelligence discovery skipped: no project identity resolved yet.";
            }
            return await disc.run({ root, report, projectId });
        } catch (err: any) {
            this.log(`[Pega Discovery] ⚠️ skipped: ${err.message}`);
            return `⚠️ Pega CodeIntelligence discovery skipped: ${err.message}`;
        }
    }

    /** Delegate to JiraProjectIndexer — fetch all Jira tickets and ingest into KB. */
    protected async runJiraProjectIndexer(
        report: ProgressReporter, secrets: vscode.SecretStorage, token?: string,
    ): Promise<string> {
        try {
            const { JiraProjectIndexer } = await import("../JiraProjectIndexer");
            const indexer = new JiraProjectIndexer(this.httpClient, this.log.bind(this));
            return await indexer.run(report, secrets, token);
        } catch (err: any) {
            this.log(`[Jira Indexer] ❌ Fatal error: ${err.message}`);
            return `❌ Jira Project Indexing Failed: ${err.message}`;
        }
    }
}
