/**
 * File system utilities — recursive copy operations for injection.
 */

import * as fs from "fs";
import * as path from "path";

const SKIP_DIRS = ["node_modules", "__pycache__", "out", "dist", ".git"];

/** Copy directory recursively, overwriting existing files. */
export function copyDirRecursive(source: string, target: string): void {
    fs.mkdirSync(target, { recursive: true });
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
        const srcPath = path.join(source, entry.name);
        const tgtPath = path.join(target, entry.name);
        if (entry.isDirectory()) {
            if (SKIP_DIRS.includes(entry.name)) { continue; }
            copyDirRecursive(srcPath, tgtPath);
        } else {
            fs.copyFileSync(srcPath, tgtPath);
        }
    }
}

/** Copy directory recursively, skipping paths in skipPaths set. */
export function copyDirFiltered(config: FilteredCopyConfig): void {
    const { source, target, workspaceRoot, skipPaths } = config;
    fs.mkdirSync(target, { recursive: true });
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
        const srcPath = path.join(source, entry.name);
        const tgtPath = path.join(target, entry.name);
        if (entry.isDirectory()) {
            if (SKIP_DIRS.includes(entry.name)) { continue; }
            copyDirFiltered({ source: srcPath, target: tgtPath, workspaceRoot, skipPaths });
        } else {
            const rel = path.relative(workspaceRoot, tgtPath).replace(/\\/g, "/");
            if (skipPaths.has(rel)) { continue; }
            fs.copyFileSync(srcPath, tgtPath);
        }
    }
}

/** Copy only specific items from source directory. */
export function copySelectedItems(source: string, target: string, items: string[]): void {
    fs.mkdirSync(target, { recursive: true });
    for (const item of items) {
        const srcPath = path.join(source, item);
        const tgtPath = path.join(target, item);
        if (!fs.existsSync(srcPath)) { continue; }
        if (fs.statSync(srcPath).isDirectory()) {
            copyDirRecursive(srcPath, tgtPath);
        } else {
            fs.mkdirSync(path.dirname(tgtPath), { recursive: true });
            fs.copyFileSync(srcPath, tgtPath);
        }
    }
}

export interface FilteredCopyConfig {
    source: string;
    target: string;
    workspaceRoot: string;
    skipPaths: Set<string>;
}
