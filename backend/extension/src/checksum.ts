// Checksum management --- per-file version tracking and modification detection
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

export interface ChecksumManifest {
    version: string;
    generatedAt: string;
    files: Record<string, FileChecksum>;
}

export interface FileChecksum {
    hash: string;
    version: string;
    injectedAt: string;
}

export interface WorkspaceManifest {
    lastUpdated: string;
    files: Record<string, WorkspaceFileEntry>;
}

export interface WorkspaceFileEntry {
    version: string;
    hash: string;
    injectedAt: string;
}

export interface FileStatus {
    relativePath: string;
    workspaceVersion: string;
    bundledVersion: string;
    state: "current" | "outdated" | "modified" | "missing";
}

export interface ModifiedFile {
    relativePath: string;
    expectedHash: string;
    actualHash: string;
    injectedVersion: string;
}

const WORKSPACE_MANIFEST = ".kiro/.sdlc-manifest.json";
const LEGACY_VERSION_FILE = ".kiro/.sdlc-version";
const BUNDLED_MANIFEST = "resources/.sdlc-checksums.json";

/** Compute SHA-256 hash of a file's content. */
export function computeFileHash(filePath: string): string {
    const content = fs.readFileSync(filePath);
    return crypto.createHash("sha256").update(content).digest("hex");
}

/** Load bundled checksums manifest from extension package. */
export function loadBundledManifest(extensionPath: string): ChecksumManifest | null {
    const manifestFile = path.join(extensionPath, BUNDLED_MANIFEST);
    if (!fs.existsSync(manifestFile)) { return null; }
    try {
        return JSON.parse(fs.readFileSync(manifestFile, "utf-8"));
    } catch {
        return null;
    }
}

/** Load per-file workspace manifest. */
export function loadWorkspaceManifest(root: string): WorkspaceManifest | null {
    const manifestFile = path.join(root, WORKSPACE_MANIFEST);
    if (!fs.existsSync(manifestFile)) { return null; }
    try {
        return JSON.parse(fs.readFileSync(manifestFile, "utf-8"));
    } catch {
        return null;
    }
}

/** Save workspace manifest to disk. */
export function saveWorkspaceManifest(root: string, manifest: WorkspaceManifest): void {
    const manifestFile = path.join(root, WORKSPACE_MANIFEST);
    fs.mkdirSync(path.dirname(manifestFile), { recursive: true });
    manifest.lastUpdated = new Date().toISOString();
    fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2), "utf-8");
}

/** Get per-file status comparing workspace vs bundled manifest. */
export function getFileStatuses(root: string, extensionPath: string): FileStatus[] {
    const bundled = loadBundledManifest(extensionPath);
    if (!bundled) { return []; }
    const wsManifest = loadWorkspaceManifest(root);

    const statuses: FileStatus[] = [];
    for (const [relativePath, entry] of Object.entries(bundled.files)) {
        const fullPath = path.join(root, relativePath);
        const wsEntry = wsManifest?.files[relativePath];
        const wsVersion = wsEntry?.version || "0.0.0";

        if (!fs.existsSync(fullPath)) {
            statuses.push({ relativePath, workspaceVersion: wsVersion, bundledVersion: entry.version, state: "missing" });
            continue;
        }

        if (wsVersion !== entry.version) {
            statuses.push({ relativePath, workspaceVersion: wsVersion, bundledVersion: entry.version, state: "outdated" });
        } else {
            const currentHash = computeFileHash(fullPath);
            if (currentHash !== entry.hash) {
                statuses.push({ relativePath, workspaceVersion: wsVersion, bundledVersion: entry.version, state: "modified" });
            } else {
                statuses.push({ relativePath, workspaceVersion: wsVersion, bundledVersion: entry.version, state: "current" });
            }
        }
    }
    return statuses;
}

/** Detect files whose hash differs from bundled (for update prompts). */
export function detectModifiedFiles(root: string, extensionPath: string): ModifiedFile[] {
    const bundled = loadBundledManifest(extensionPath);
    if (!bundled) { return []; }

    const modified: ModifiedFile[] = [];
    for (const [relativePath, entry] of Object.entries(bundled.files)) {
        const fullPath = path.join(root, relativePath);
        if (!fs.existsSync(fullPath)) { continue; }
        const currentHash = computeFileHash(fullPath);
        if (currentHash !== entry.hash) {
            modified.push({
                relativePath,
                expectedHash: entry.hash,
                actualHash: currentHash,
                injectedVersion: entry.version
            });
        }
    }
    return modified;
}

/** Check if any bundled file is newer than workspace version. */
export function isUpgradeAvailable(root: string, extensionPath: string): boolean {
    const bundled = loadBundledManifest(extensionPath);
    if (!bundled) { return false; }
    const wsManifest = loadWorkspaceManifest(root);
    if (!wsManifest) { return true; }

    for (const [relativePath, entry] of Object.entries(bundled.files)) {
        const wsEntry = wsManifest.files[relativePath];
        if (!wsEntry || wsEntry.version !== entry.version) { return true; }
    }
    return false;
}

/** Migrate from legacy .sdlc-version to new per-file manifest. */
export function migrateLegacyVersion(root: string, extensionPath: string): void {
    const legacyFile = path.join(root, LEGACY_VERSION_FILE);
    if (!fs.existsSync(legacyFile)) { return; }

    const bundled = loadBundledManifest(extensionPath);
    if (!bundled) { return; }

    let legacyVersion = "1.0.0";
    try {
        const raw = JSON.parse(fs.readFileSync(legacyFile, "utf-8"));
        legacyVersion = raw.version || "1.0.0";
    } catch { /* default to 1.0.0 */ }

    const wsManifest: WorkspaceManifest = { lastUpdated: new Date().toISOString(), files: {} };
    for (const [relativePath] of Object.entries(bundled.files)) {
        const fullPath = path.join(root, relativePath);
        if (fs.existsSync(fullPath)) {
            wsManifest.files[relativePath] = {
                version: legacyVersion,
                hash: computeFileHash(fullPath),
                injectedAt: new Date().toISOString()
            };
        }
    }

    saveWorkspaceManifest(root, wsManifest);
    fs.unlinkSync(legacyFile);
}

/** Build workspace manifest after a full inject. */
export function buildManifestAfterInject(root: string, extensionPath: string): void {
    const bundled = loadBundledManifest(extensionPath);
    if (!bundled) { return; }

    const wsManifest: WorkspaceManifest = { lastUpdated: new Date().toISOString(), files: {} };
    for (const [relativePath, entry] of Object.entries(bundled.files)) {
        const fullPath = path.join(root, relativePath);
        if (fs.existsSync(fullPath)) {
            wsManifest.files[relativePath] = {
                version: entry.version,
                hash: computeFileHash(fullPath),
                injectedAt: new Date().toISOString()
            };
        }
    }
    saveWorkspaceManifest(root, wsManifest);
}
