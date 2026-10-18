/**
 * Persist a Pega rule object as a .pega.json file (SA4E-92).
 */

import * as path from "path";
import * as fs from "fs";
import type { LogFn } from "./types";

/**
 * Save a Pega rule object as a .pega.json file in the workspace rules/ directory.
 * Idempotent: skips if file already exists.
 */
export function saveRuleFile(
    rObj: Record<string, unknown>,
    root: string,
    log: LogFn,
    fallbackClass?: string,
    fallbackName?: string,
): void {
    try {
        const objClass = (rObj.pxObjClass as string) || fallbackClass || "Rule";
        const ruleName = (rObj.pyRuleName as string)
            || (rObj.pyPropertyName as string)
            || (rObj.pyActivityName as string)
            || (rObj.pyFlowName as string)
            || (rObj.pyModelName as string)
            || (rObj.pyLabel as string)
            || fallbackName || "Rule";
        const safeClass = objClass.replace(/[^a-zA-Z0-9_-]/g, "_");
        const safeName = ruleName.replace(/[^a-zA-Z0-9_.-]/g, "_");

        const targetDir = path.join(root, "rules", safeClass);
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }
        const filePath = path.join(targetDir, `${safeName}.pega.json`);
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, JSON.stringify(rObj, null, 2), "utf-8");
            log(`[Pega Indexer] 💾 Saved ${safeClass}/${safeName}.pega.json`);
        }
    } catch (fileErr: any) {
        log(`[Pega Indexer] ⚠️ File save error: ${fileErr.message}`);
    }
}
