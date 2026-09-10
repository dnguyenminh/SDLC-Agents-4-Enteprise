/**
 * PegaProjectIndexer — Crawl and ingest Pega project rules (SA4E-94).
 * Enumerate-then-fetch pipeline: RuleSet enumeration → chunked content fetch → NDJSON ingest.
 * @deprecated Replaced by PegaDataPageEnumerator + PegaBfsIndexer (SA4E-156).
 * Kept for feature-flag rollback only. Will be removed in next major version.
 */
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as crypto from "crypto";
import type { IndexerHttpClient } from "./IndexerHttpClient";
import { fetchRulesInParallel, fetchRuleTypesInParallel, saveRuleFile, calibrateFetchConcurrency } from "./PegaCrawlHelper";
import { enumerateAllRuleSets } from "./PegaRuleSetEnumerator";
import { discoverAppClasses, fetchCategoryRules } from "./PegaAppClassDiscovery";
import { summaryToCrawlItem } from "../models";
import { setProjectId } from "../extension";
import { createPegaDedupSet } from "./DiskBackedSet";

type ProgressReporter = vscode.Progress<{ message?: string }>;

function computeRuleChecksum(rule: Record<string, unknown>): string {
    return crypto.createHash('sha256').update(JSON.stringify(rule)).digest('hex');
}

export class PegaProjectIndexer {
    constructor(
        private readonly httpClient: IndexerHttpClient,
        private readonly outputChannel: vscode.OutputChannel | undefined,
        private readonly log: (msg: string) => void,
    ) {}

    async run(root: string, report: ProgressReporter, secrets?: vscode.SecretStorage): Promise<string | null> {
        const { appName, operatorId, caseTypes } = await this.detectProject(root);
        if (!appName) { return null; }

        this.log(`[Pega Indexer] 🏛️ Pega Project Detected: "pega:${appName}"`);
        report.report({ message: `🏛️ Pega Project: pega:${appName} — Crawling...` });

        if (!secrets) {
            return `🏛️ Pega Project: pega:${appName} (${caseTypes.length} CaseTypes) — Metadata only`;
        }

        const { PegaHttpClient } = await import("./PegaHttpClient");
        const pegaClient = new PegaHttpClient(secrets, this.outputChannel);

        // SA4E-241 SEC-03: no hardcoded operator-id default — resolver fails closed
        // if neither the hint nor the configured pegaUsername is present.
        const hierarchy = await pegaClient.resolveDeterministicPegaHierarchy(operatorId);
        const seeds = this.buildSeeds(hierarchy.seeds, caseTypes);
        const projectId = this.resolveProjectId(appName || hierarchy.appName);
        if (!projectId) { return null; }

        setProjectId(projectId);
        this.log(`[Pega Indexer] 📌 Project ID: "${projectId}"`);

        report.report({ message: `Enumerating rules from ${hierarchy.ruleSets.length} RuleSets...` });
        const enumeratedMap = await enumerateAllRuleSets(hierarchy.ruleSets, pegaClient, this.log);

        // SA4E-173: Discover additional classes from Application rule
        report.report({ message: `Discovering classes from Application rule...` });
        const appClasses = await discoverAppClasses(pegaClient, hierarchy, root, this.log);
        this.log(`[Pega Indexer] 📋 App classes discovered: ${appClasses.length} (work + data)`);

        if (enumeratedMap.size === 0 && seeds.length > 0) {
            this.log(`[Pega Indexer] ⚠️ Enumeration 0 rules. Fallback to seeds.`);
            const plan = await pegaClient.crawlPlan({ projectId, ruleKeys: seeds, visitedKeys: [] });
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

        const crawlSet = Array.from(enumeratedMap.values()).map(summaryToCrawlItem);
        this.log(`[Pega Indexer] 📋 Crawl set: ${crawlSet.length} rules`);

        await calibrateFetchConcurrency(pegaClient, crawlSet.length, this.log);
        const fetchedRules = await this.fetchAllRules(crawlSet, pegaClient, root, report);

        // SA4E-155: Log rules with multiple versions (helps identify Pega API filter issue)
        this.logDuplicateVersions(fetchedRules);

        const result = await this.ingestRules(fetchedRules, pegaClient, projectId, crawlSet);
        const rawName = appName || hierarchy.appName;

        // SA4E-172: Resolve DataTable + Database rules from indexed class definitions
        const dtResult = await this.resolveDataTables(pegaClient, projectId, root, report);
        this.log(`[Pega Indexer] 📊 DataTable resolution: ${dtResult.dataTablesResolved} tables, ${dtResult.databasesResolved} databases`);

        return `🏛️ Pega: "pega:${rawName}" — Ingested ${fetchedRules.length} rules (KB: ${result.kb}, Graph: ${result.graph})`;
    }

    /**
     * SA4E-172: Post-BFS step — resolve DataTable and Database rules.
     * Uses dynamic import to avoid circular dependency.
     */
    private async resolveDataTables(
        pegaClient: any, projectId: string, root: string, report: ProgressReporter,
    ): Promise<{ dataTablesResolved: number; databasesResolved: number }> {
        try {
            const { DataTableResolver } = await import("./DataTableResolver");
            const { PegaStreamIngester } = await import("./PegaStreamIngester");
            const ingester = new PegaStreamIngester(pegaClient.getBackendUrlPublic());
            const resolver = new DataTableResolver(pegaClient, ingester, this.log);
            return await resolver.resolve(projectId, root, report);
        } catch (err: any) {
            this.log(`[Pega Indexer] ⚠️ DataTable resolution failed: ${err.message}`);
            return { dataTablesResolved: 0, databasesResolved: 0 };
        }
    }

    private async detectProject(root: string) {
        let appName = "", operatorId = "", caseTypes: string[] = [];
        try {
            const raw = fs.readFileSync(path.join(root, "pega-project.json"), "utf-8");
            const json = JSON.parse(raw);
            if (json.isPegaProject) {
                appName = json.applicationName || "";
                operatorId = json.operatorId || "";
                caseTypes = (json.caseTypes || []).map((c: any) => c.caseTypeID || c.name);
            }
        } catch (err) { console.debug('[PegaProjectIndexer] not a Pega project :', (err as Error).message); }
        return { appName, operatorId, caseTypes };
    }

    private buildSeeds(hierarchySeeds: string[], caseTypes: string[]): string[] {
        const seedSet = new Set<string>(hierarchySeeds);
        for (const ct of caseTypes) {
            if (ct.includes("-")) { seedSet.add(`RULE-OBJ-CLASS ${ct}`); }
        }
        return Array.from(seedSet);
    }

    /**
     * SA4E-155: Log rules that have multiple versions in the fetched set.
     * Groups by FQN (pxObjClass:pyClassName:ruleName) which is the dedup key used by ingestRule.
     */
    private logDuplicateVersions(rules: Record<string, unknown>[]): void {
        // Group by FQN = pxObjClass:pyClassName:name (same logic as PegaSymbolParser)
        const versionMap = new Map<string, { versions: string[]; sources: string[] }>();
        for (const rule of rules) {
            const ruleType = String(rule.pxObjClass || '');
            const className = String(rule.pyClassName || '@baseclass');
            const name = String(rule.pyActivityName || rule.pyModelName || rule.pyRuleName || rule.pyLabel || '');
            const version = String(rule.pyRuleSetVersion || '');
            const source = String((rule as any)._sourceClass || className);
            const fqn = `${ruleType}:${className}:${name}`;
            if (!versionMap.has(fqn)) { versionMap.set(fqn, { versions: [], sources: [] }); }
            const entry = versionMap.get(fqn)!;
            entry.versions.push(version);
            entry.sources.push(source);
        }

        const duplicates = Array.from(versionMap.entries())
            .filter(([, data]) => data.versions.length > 1)
            .sort((a, b) => b[1].versions.length - a[1].versions.length);

        if (duplicates.length === 0) {
            this.log(`[Pega Indexer] ✅ No duplicate versions found — all ${versionMap.size} FQNs are unique.`);
            return;
        }

        const totalWasted = rules.length - versionMap.size;
        this.log(`\n=== DUPLICATE VERSIONS REPORT ===`);
        this.log(`Total fetched rules: ${rules.length}`);
        this.log(`Unique FQNs: ${versionMap.size}`);
        this.log(`Rules with multiple occurrences: ${duplicates.length}`);
        this.log(`Wasted fetches (overwritten by dedup): ${totalWasted}`);

        // Categorize: same-version duplicates (inheritance) vs real multi-version
        const inherited = duplicates.filter(([, d]) => new Set(d.versions).size === 1);
        const multiVersion = duplicates.filter(([, d]) => new Set(d.versions).size > 1);

        if (multiVersion.length > 0) {
            this.log(`\n⚠️ REAL multi-version rules (API not filtering latest): ${multiVersion.length}`);
            for (const [fqn, data] of multiVersion.slice(0, 20)) {
                const uniqueVersions = [...new Set(data.versions)].join(', ');
                this.log(`  ${fqn} — ${data.versions.length} entries, unique versions: [${uniqueVersions}]`);
            }
        }

        if (inherited.length > 0) {
            this.log(`\n📋 Inherited duplicates (same rule fetched from ${inherited.length} class expansions):`);
            for (const [fqn, data] of inherited.slice(0, 10)) {
                this.log(`  ${fqn} — fetched ${data.versions.length}x (version: ${data.versions[0]})`);
            }
            if (inherited.length > 10) {
                this.log(`  ... and ${inherited.length - 10} more inherited duplicates`);
            }
        }

        this.log(`=== END DUPLICATE VERSIONS REPORT ===\n`);
    }

    private resolveProjectId(appName: string): string | null {
        if (!appName) { return null; }
        return crypto.createHash('sha256').update('pega:' + appName).digest('hex').slice(0, 12);
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
                    if (this.isClassRule(item, ruleObj)) {
                        const className = (ruleObj.pyClassName as string) || item.pyClassName;
                        if (className) {
                            const subs = await fetchRuleTypesInParallel(className, pegaClient, visitedKeys, this.log);
                            for (const sr of subs) { saveRuleFile(sr.rule, root, this.log, sr.ruleType); fetched.push(sr.rule); }
                            // SA4E-173: Category-based rule discovery via directChildren
                            const catRules = await fetchCategoryRules(className, pegaClient, visitedKeys, root, this.log);
                            fetched.push(...catRules);
                        }
                        // SA4E-172: Resolve DataTable + Database for this class inline
                        await this.resolveDataTableForClass(ruleObj, pegaClient, root);
                    }
                }
            }
        } finally {
            // Clear RAM + delete the spill file once this index run completes.
            visitedKeys.dispose();
        }
        return fetched;
    }

    private isClassRule(item: any, ruleObj: any): boolean {
        return item.pxObjClass === "Rule-OBJ-CLASS" || item.pxObjClass === "Rule-Obj-Class"
            || ruleObj.pxObjClass === "Rule-Obj-Class";
    }

    /**
     * SA4E-172: Resolve DataTable + Database rule for a single class inline during fetch.
     * SA4E-160: Also fetches full class hierarchy via D_pzInheritanceListofClass.
     */
    private async resolveDataTableForClass(
        classJson: Record<string, unknown>, pegaClient: any, root: string,
    ): Promise<void> {
        try {
            const { computeDataTableKey, computeDatabaseKey, isCriticalError } = await import("./DataTableKeyComputer");
            const className = String(classJson.pyClassName || "");
            const classRule = {
                pzInsKey: String(classJson.pzInsKey || ""),
                pyClassName: className,
                pyClassType: String(classJson.pyClassType || ""),
                pyClassGroupIndicator: String(classJson.pyClassGroupIndicator || ""),
                pyClassGroup: classJson.pyClassGroup ? String(classJson.pyClassGroup) : undefined,
            };

            // SA4E-160: Fetch full class hierarchy via D_pzInheritanceListofClass
            if (className) {
                try {
                    const parents = await pegaClient.fetchClassHierarchy(className);
                    if (parents.length > 0) {
                        this.log(`[PegaHierarchy] 🔗 Class "${className}" hierarchy: [${parents.join(" → ")}]`);
                        for (const parentName of parents) {
                            const parentInsKey = `RULE-OBJ-CLASS ${parentName.toUpperCase()}`;
                            try {
                                const parentRule = await pegaClient.getRuleByInsKey(parentInsKey);
                                saveRuleFile(parentRule, root, this.log, "Rule-Obj-Class");
                                this.log(`[PegaHierarchy] ✅ Parent class downloaded: ${parentName}`);
                            } catch {
                                this.log(`[PegaHierarchy] ⚠️ Parent class "${parentName}" not fetchable. Skipping.`);
                            }
                        }
                    }
                } catch (hierErr: any) {
                    this.log(`[PegaHierarchy] ⚠️ D_pzInheritanceListofClass failed for "${className}": ${hierErr.message}`);
                }
            }

            // SA4E-172: Resolve DataTable + Database
            const dtKey = computeDataTableKey(classRule);
            if (!dtKey) { return; } // Abstract or unknown indicator

            // Fetch DataTable rule
            try {
                const dtRule = await pegaClient.getRuleByInsKey(dtKey);
                saveRuleFile(dtRule, root, this.log, "Data-Admin-DB-Table");
                this.log(`[DataTableResolver] ✅ DataTable fetched: ${dtKey}`);

                // Fetch Database rule from DataTable
                const dbName = dtRule.pyDatabaseName ? String(dtRule.pyDatabaseName) : "";
                const dbKey = computeDatabaseKey(dbName);
                if (dbKey) {
                    try {
                        const dbRule = await pegaClient.getRuleByInsKey(dbKey);
                        saveRuleFile(dbRule, root, this.log, "Data-Admin-DB-Name");
                        this.log(`[DataTableResolver] ✅ Database fetched: ${dbKey}`);
                    } catch (dbErr: any) {
                        if (isCriticalError(dbErr)) { throw dbErr; }
                        this.log(`[DataTableResolver] ⚠️ Database not found: ${dbKey}. Skipping.`);
                    }
                }
            } catch (dtErr: any) {
                if (isCriticalError(dtErr)) { throw dtErr; }
                this.log(`[DataTableResolver] ⚠️ DataTable not found: ${dtKey}. Skipping.`);
            }
        } catch (err: any) {
            this.log(`[DataTableResolver] ⚠️ Error resolving DataTable for class: ${err.message}`);
        }
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

        const { PegaStreamIngester } = await import("./PegaStreamIngester");
        const ingester = new PegaStreamIngester(pegaClient.getBackendUrlPublic());
        const visited = crawlSet.map((c: any) => c.insKey);
        const res = await ingester.streamIngest(rules, projectId, checksums, versions, visited, this.log);
        return { kb: res.totalKbEntriesInDb || 0, graph: res.totalGraphNodesInDb || 0 };
    }
}
