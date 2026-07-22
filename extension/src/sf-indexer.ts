/**
 * Salesforce project detection and metadata counting utilities.
 * Used by the workspace indexer to auto-detect SFDX projects and show
 * Salesforce-specific summaries.
 */

import * as fs from "fs";
import * as path from "path";

/** Salesforce metadata categories for result reporting. */
export interface SfIndexResult {
    apexClasses: number;
    flows: number;
    objects: number;
    lwc: number;
    triggers: number;
    total: number;
}

/**
 * Detect SFDX project root by looking for sfdx-project.json.
 * Checks workspace root first, then immediate subdirectories.
 */
export function detectSfdxProject(root: string): string | null {
    if (fs.existsSync(path.join(root, "sfdx-project.json"))) { return root; }
    try {
        const dirs = fs.readdirSync(root, { withFileTypes: true })
            .filter(d => d.isDirectory() && !d.name.startsWith("."));
        for (const dir of dirs) {
            const dirPath = path.join(root, dir.name);
            if (fs.existsSync(path.join(dirPath, "sfdx-project.json"))) { return dirPath; }
        }
    } catch (err) {
      console.debug(`[sf-indexer] findSalesforceRoot failed (non-fatal): ${(err as Error).message}`);
    }
    return null;
}

/**
 * Count Salesforce metadata files by category for result reporting.
 */
export function countSalesforceMetadata(sfdxRoot: string): SfIndexResult {
    const result: SfIndexResult = { apexClasses: 0, flows: 0, objects: 0, lwc: 0, triggers: 0, total: 0 };

    const walkDir = (dir: string, ext: string): number => {
        if (!fs.existsSync(dir)) { return 0; }
        try { return countFilesRecursive(dir, ext); }
        catch (err) {
          console.debug(`[sf-indexer] countFilesRecursive failed (non-fatal): ${(err as Error).message}`);
          return 0;
        }
    };

    const forcePath = path.join(sfdxRoot, "force-app", "main", "default");
    const altPath = path.join(sfdxRoot, "src");
    const basePath = fs.existsSync(forcePath) ? forcePath : altPath;
    if (!fs.existsSync(basePath)) { return result; }

    result.apexClasses = walkDir(path.join(basePath, "classes"), ".cls");
    result.triggers = walkDir(path.join(basePath, "triggers"), ".trigger");
    result.flows = walkDir(path.join(basePath, "flows"), ".flow-meta.xml")
        + walkDir(path.join(basePath, "flowDefinitions"), ".flowDefinition-meta.xml");
    result.objects = walkDir(path.join(basePath, "objects"), ".object-meta.xml")
        + countFilesRecursive(path.join(basePath, "objects"), ".field-meta.xml");
    result.lwc = countDirectories(path.join(basePath, "lwc"));

    result.total = result.apexClasses + result.triggers + result.flows + result.objects + result.lwc;
    return result;
}

function countFilesRecursive(dir: string, ext: string): number {
    if (!fs.existsSync(dir)) { return 0; }
    let count = 0;
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) { count += countFilesRecursive(fullPath, ext); }
            else if (entry.name.endsWith(ext)) { count++; }
        }
    } catch (err) {
      // Permission error or IO failure — log and return partial count
      console.warn(`[sf-indexer] countFilesRecursive error in '${dir}': ${(err as Error).message}`);
    }
    return count;
}

function countDirectories(dir: string): number {
    if (!fs.existsSync(dir)) { return 0; }
    try {
        return fs.readdirSync(dir, { withFileTypes: true })
            .filter(d => d.isDirectory() && !d.name.startsWith(".")).length;
    } catch (err) {
      console.warn(`[sf-indexer] countDirectories error in '${dir}': ${(err as Error).message}`);
      return 0;
    }
}
