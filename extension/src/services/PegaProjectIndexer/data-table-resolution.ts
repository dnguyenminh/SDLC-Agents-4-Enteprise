/**
 * PegaProjectIndexer — DataTable / Database / class-hierarchy resolution
 * (SA4E-160/172). Extracted from the indexer class; logging is injected.
 */

import * as vscode from "vscode";
import { saveRuleFile } from "../PegaCrawlHelper";
import type { IngestAuthProvider } from "../../utils/backend-auth-headers";

type ProgressReporter = vscode.Progress<{ message?: string }>;
type LogFn = (msg: string) => void;

/**
 * SA4E-172: Post-BFS step — resolve DataTable and Database rules.
 * Uses dynamic import to avoid circular dependency.
 */
export async function resolveDataTables(
    pegaClient: any, projectId: string, root: string, report: ProgressReporter,
    log: LogFn, auth?: IngestAuthProvider,
): Promise<{ dataTablesResolved: number; databasesResolved: number }> {
    try {
        const { DataTableResolver } = await import("../DataTableResolver");
        const { PegaStreamIngester } = await import("../PegaStreamIngester");
        const ingester = new PegaStreamIngester(pegaClient.getBackendUrlPublic(), auth);
        const resolver = new DataTableResolver(pegaClient, ingester, log);
        return await resolver.resolve(projectId, root, report);
    } catch (err: any) {
        log(`[Pega Indexer] ⚠️ DataTable resolution failed: ${err.message}`);
        return { dataTablesResolved: 0, databasesResolved: 0 };
    }
}

/**
 * SA4E-172: Resolve DataTable + Database rule for a single class inline during fetch.
 * SA4E-160: Also fetches full class hierarchy via D_pzInheritanceListofClass.
 */
export async function resolveDataTableForClass(
    classJson: Record<string, unknown>, pegaClient: any, root: string, log: LogFn,
): Promise<void> {
    try {
        const { computeDataTableKey } = await import("../DataTableKeyComputer");
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
            await downloadParentClasses(className, pegaClient, root, log);
        }

        // SA4E-172: Resolve DataTable + Database
        const dtKey = computeDataTableKey(classRule);
        if (!dtKey) { return; } // Abstract or unknown indicator

        // Fetch DataTable rule
        await resolveTableAndDatabase(dtKey, pegaClient, root, log);
    } catch (err: any) {
        log(`[DataTableResolver] ⚠️ Error resolving DataTable for class: ${err.message}`);
    }
}

/** SA4E-160: Download every parent class rule of `className` (best-effort). */
async function downloadParentClasses(
    className: string, pegaClient: any, root: string, log: LogFn,
): Promise<void> {
    try {
        const parents = await pegaClient.fetchClassHierarchy(className);
        if (parents.length > 0) {
            log(`[PegaHierarchy] 🔗 Class "${className}" hierarchy: [${parents.join(" → ")}]`);
            for (const parentName of parents) {
                const parentInsKey = `RULE-OBJ-CLASS ${parentName.toUpperCase()}`;
                try {
                    const parentRule = await pegaClient.getRuleByInsKey(parentInsKey);
                    saveRuleFile(parentRule, root, log, "Rule-Obj-Class");
                    log(`[PegaHierarchy] ✅ Parent class downloaded: ${parentName}`);
                } catch {
                    log(`[PegaHierarchy] ⚠️ Parent class "${parentName}" not fetchable. Skipping.`);
                }
            }
        }
    } catch (hierErr: any) {
        log(`[PegaHierarchy] ⚠️ D_pzInheritanceListofClass failed for "${className}": ${hierErr.message}`);
    }
}

/** SA4E-172: Fetch the DataTable rule, then its Database rule (critical errors rethrow). */
async function resolveTableAndDatabase(
    dtKey: string, pegaClient: any, root: string, log: LogFn,
): Promise<void> {
    const { computeDatabaseKey, isCriticalError } = await import("../DataTableKeyComputer");
    try {
        const dtRule = await pegaClient.getRuleByInsKey(dtKey);
        saveRuleFile(dtRule, root, log, "Data-Admin-DB-Table");
        log(`[DataTableResolver] ✅ DataTable fetched: ${dtKey}`);

        // Fetch Database rule from DataTable
        const dbName = dtRule.pyDatabaseName ? String(dtRule.pyDatabaseName) : "";
        const dbKey = computeDatabaseKey(dbName);
        if (dbKey) {
            try {
                const dbRule = await pegaClient.getRuleByInsKey(dbKey);
                saveRuleFile(dbRule, root, log, "Data-Admin-DB-Name");
                log(`[DataTableResolver] ✅ Database fetched: ${dbKey}`);
            } catch (dbErr: any) {
                if (isCriticalError(dbErr)) { throw dbErr; }
                log(`[DataTableResolver] ⚠️ Database not found: ${dbKey}. Skipping.`);
            }
        }
    } catch (dtErr: any) {
        if (isCriticalError(dtErr)) { throw dtErr; }
        log(`[DataTableResolver] ⚠️ DataTable not found: ${dtKey}. Skipping.`);
    }
}
