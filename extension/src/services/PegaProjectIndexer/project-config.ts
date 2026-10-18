/**
 * PegaProjectIndexer — project detection, seed building and id helpers.
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

export function computeRuleChecksum(rule: Record<string, unknown>): string {
    return crypto.createHash('sha256').update(JSON.stringify(rule)).digest('hex');
}

export function detectProject(root: string): { appName: string; operatorId: string; caseTypes: string[] } {
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

export function buildSeeds(hierarchySeeds: string[], caseTypes: string[]): string[] {
    const seedSet = new Set<string>(hierarchySeeds);
    for (const ct of caseTypes) {
        if (ct.includes("-")) { seedSet.add(`RULE-OBJ-CLASS ${ct}`); }
    }
    return Array.from(seedSet);
}

export function resolveProjectId(appName: string): string | null {
    if (!appName) { return null; }
    return crypto.createHash('sha256').update('pega:' + appName).digest('hex').slice(0, 12);
}
