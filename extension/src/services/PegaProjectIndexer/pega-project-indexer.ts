/**
 * PegaProjectIndexer — Crawl and ingest Pega project rules (SA4E-94).
 * Enumerate-then-fetch pipeline: RuleSet enumeration → chunked content fetch → NDJSON ingest.
 * @deprecated Replaced by PegaDataPageEnumerator + PegaBfsIndexer (SA4E-156).
 * Kept for feature-flag rollback only. Will be removed in next major version.
 */

import * as vscode from "vscode";
import type { IndexerHttpClient } from "../IndexerHttpClient";
import { fetchRulesInParallel, fetchRuleTypesInParallel, saveRuleFile, calibrateFetchConcurrency } from "../PegaCrawlHelper";
import { enumerateAllRuleSets } from "../PegaRuleSetEnumerator";
import { discoverAppClasses, fetchCategoryRules } from "../PegaAppClassDiscovery";
import { summaryToCrawlItem, type RuleSetRuleSummary } from "../../models";
import { setProjectId } from "../../extension";
import { createPegaDedupSet, type MembershipSet } from "../DiskBackedSet";
import type { IngestAuthProvider } from "../../utils/backend-auth-headers";
import { buildSeeds, computeRuleChecksum, detectProject, resolveProjectId } from "./project-config";
import { logDuplicateVersions } from "./duplicate-report";
import { resolveDataTables as resolveDataTablesPhase, resolveDataTableForClass } from "./data-table-resolution";

type ProgressReporter = vscode.Progress<{ message?: string }>;

export class PegaProjectIndexer {
    constructor(
        private readonly httpClient: IndexerHttpClient,
        private readonly outputChannel: vscode.OutputChannel | undefined,
        private readonly log: (msg: string) => void,
        private readonly auth?: IngestAuthProvider,
    ) {}

    async run(root: string, report: ProgressReporter, secrets?: vscode.SecretStorage): Promise<string | null> {
        const { appName, operatorId, caseTypes } = await detectProject(root);
        if (!appName) { return null; }

        this.log(`[Pega Indexer] 🏛️ Pega Project Detected: "pega:${appName}"`);
        report.report({ message: `🏛️ Pega Project: pega:${appName} — Crawling...` });

        if (!secrets) {
            return `🏛️ Pega Project: pega:${appName} (${caseTypes.length} CaseTypes) — Metadata only`;
        }

        const { PegaHttpClient } = await import("../PegaHttpClient");
        const pegaClient = new PegaHttpClient(secrets, this.outputChannel);

        // SA4E-241 SEC-03: no hardcoded operator-id default — resolver fails closed
        // if neither the hint nor the configured pegaUsername is present.
        const hierarchy = await pegaClient.resolveDeterministicPegaHierarchy(operatorId);
        const seeds = buildSeeds(hierarchy.seeds, caseTypes);
        const projectId = resolveProjectId(appName || hierarchy.appName);
        if (!projectId) { return null; }

        setProjectId(projectId);
        this.log(`[Pega Indexer] 📌 Project ID: "${projectId}"`);

        report.report({ message: `Enumerating rules from ${hierarchy.ruleSets.length} RuleSets...` });
        const enumeratedMap = await enumerateAllRuleSets(hierarchy.ruleSets, pegaClient, this.log);

        // SA4E-173: Discover additional classes from Application rule
        report.report({ message: `Discovering classes from Application rule...` });
        const appClasses = await discoverAppClasses(pegaClient, hierarchy, root, this.log);
        this.log(`[Pega Indexer] 📋 App classes discovered: ${appClasses.length} (work + data)`);

        await this.expandCrawlSet(pegaClient, enumeratedMap, seeds, appClasses, projectId);

        const crawlSet = Array.from(enumeratedMap.values()).map(summaryToCrawlItem);
        this.log(`[Pega Indexer] 📋 Crawl set: ${crawlSet.length} rules`);

        await calibrateFetchConcurrency(pegaClient, crawlSet.length, this.log);
        const fetchedRules = await this.fetchAllRules(crawlSet, pegaClient, root, report);

        // SA4E-155: Log rules with multiple versions (helps identify Pega API filter issue)
        logDuplicateVersions(fetchedRules, this.log);

        const result = await this.ingestRules(fetchedRules, pegaClient, projectId, crawlSet);
        const rawName = appName || hierarchy.appName;

        // SA4E-172: Resolve DataTable + Database rules from indexed class definitions
        const dtResult = await this.resolveDataTables(pegaClient, projectId, root, report);
        this.log(`[Pega Indexer] 📊 DataTable resolution: ${dtResult.dataTablesResolved} tables, ${dtResult.databasesResolved} databases`);

        return `🏛️ Pega: "pega:${rawName}" — Ingested ${fetchedRules.length} rules (KB: ${result.kb}, Graph: ${result.graph})`;
    }

    /** Merge crawl-plan fallback + discovered app classes into the enumeration map. */
    private async expandCrawlSet(
        pegaClient: any, enumeratedMap: Map<string, RuleSetRuleSummary>,
        seeds: string[], appClasses: string[], projectId: string,
    ): Promise<void> {
        if (enumeratedMap.size === 0 && seeds.length > 0) {
            this.log(`[Pega Indexer] ⚠️ Enumeration 0 rules. Fallback to seeds.`);
            // SA4E-362 CR-01: thread the ingest auth provider (FR-7) — crawl-plan is a
            // /api/v1/pega/* POST behind jwtAuth; refresh-on-401 applies like every site.
            const plan = await pegaClient.crawlPlan({ projectId, ruleKeys: seeds, visitedKeys: [] }, this.auth);
            for (const item of plan.missing) {
                enumeratedMap.set(item.insKey, {
                    pzInsKey: item.insKey, pxObjClass: item.pxObjClass,
                    pyClassName: item.pyClassName, pyRuleName: item.pyRuleName,
                    pyRuleSet: '', pyRuleSetVersion: '',
                });
            }
        }

        // SA4E-173: Merge discovered app classes into enumeratedMap
        for (const classKey of appClasses) {
            if (!enumeratedMap.has(classKey)) {
                enumeratedMap.set(classKey, {
                    pzInsKey: classKey, pxObjClass: 'Rule-Obj-Class',
                    pyClassName: classKey.replace('RULE-OBJ-CLASS ', ''),
                    pyRuleName: '', pyRuleSet: '', pyRuleSetVersion: '',
                });
            }
        }
    }

    private async fetchAllRules(
        crawlSet: any[], pegaClient: any, root: string, report: ProgressReporter,
    ): Promise<Record<string, unknown>[]> {
        const CHUNK = 50;
        // Disk-backed dedup: bounded RAM + spill-to-disk so the visited set does not
        // grow unbounded on large rulebases. Disposed in finally (deletes spill file).
        const visitedKeys = createPegaDedupSet(root, 'project-indexer');
        const fetched: Record<string, unknown>[] = [];

        try {
            for (let i = 0; i < crawlSet.length; i += CHUNK) {
                const chunk = crawlSet.slice(i, i + CHUNK);
                report.report({ message: `Fetching (${i + chunk.length}/${crawlSet.length})...` });
                for (const item of chunk) { visitedKeys.add(item.insKey); }

                const result = await fetchRulesInParallel(chunk, pegaClient, this.log);
                if (result.serverError) { throw new Error(result.serverError); }

                for (const { ruleObj, item } of result.fetched) {
                    fetched.push(ruleObj);
                    saveRuleFile(ruleObj, root, this.log, item.pxObjClass, item.pyRuleName);
                    await this.processClassRule(ruleObj, item, pegaClient, root, visitedKeys, fetched);
                }
            }
        } finally {
            // Clear RAM + delete the spill file once this index run completes.
            visitedKeys.dispose();
        }
        return fetched;
    }

    /** SA4E-172/173: Extra fetches for class rules — sub-rules, category rules, DataTables. */
    private async processClassRule(
        ruleObj: Record<string, unknown>, item: any, pegaClient: any, root: string,
        visitedKeys: MembershipSet, fetched: Record<string, unknown>[],
    ): Promise<void> {
        if (!this.isClassRule(item, ruleObj)) { return; }
        const className = (ruleObj.pyClassName as string) || item.pyClassName;
        if (className) {
            const subs = await fetchRuleTypesInParallel(className, pegaClient, visitedKeys, this.log);
            for (const sr of subs) { saveRuleFile(sr.rule, root, this.log, sr.ruleType); fetched.push(sr.rule); }
            // SA4E-173: Category-based rule discovery via directChildren
            const catRules = await fetchCategoryRules(className, pegaClient, visitedKeys, root, this.log);
            fetched.push(...catRules);
        }
        // SA4E-172: Resolve DataTable + Database for this class inline
        await resolveDataTableForClass(ruleObj, pegaClient, root, this.log);
    }

    private isClassRule(item: any, ruleObj: any): boolean {
        return item.pxObjClass === "Rule-OBJ-CLASS" || item.pxObjClass === "Rule-Obj-Class"
            || ruleObj.pxObjClass === "Rule-Obj-Class";
    }

    /**
     * SA4E-172: Post-BFS step — resolve DataTable and Database rules.
     * Uses dynamic import to avoid circular dependency.
     */
    private async resolveDataTables(
        pegaClient: any, projectId: string, root: string, report: ProgressReporter,
    ): Promise<{ dataTablesResolved: number; databasesResolved: number }> {
        return resolveDataTablesPhase(pegaClient, projectId, root, report, this.log, this.auth);
    }

    private async ingestRules(
        rules: Record<string, unknown>[], pegaClient: any, projectId: string, crawlSet: any[],
    ): Promise<{ kb: number; graph: number }> {
        if (rules.length === 0) { return { kb: 0, graph: 0 }; }

        const checksums: Record<string, string> = {};
        const versions: Record<string, string> = {};
        for (const rule of rules) {
            const fqn = `${(rule as any).pxObjClass}:${(rule as any).pyClassName}:${(rule as any).pyRuleName || ''}`;
            checksums[fqn] = computeRuleChecksum(rule);
            const ver = (rule as any).pyRuleVersion || (rule as any).pyVersion || '';
            if (ver) { versions[fqn] = ver; }
        }

        const { PegaStreamIngester } = await import("../PegaStreamIngester");
        const ingester = new PegaStreamIngester(pegaClient.getBackendUrlPublic(), this.auth);
        const visited = crawlSet.map((c: any) => c.insKey);
        const res = await ingester.streamIngest(rules, projectId, checksums, versions, visited, this.log);
        return { kb: res.totalKbEntriesInDb || 0, graph: res.totalGraphNodesInDb || 0 };
    }
}
