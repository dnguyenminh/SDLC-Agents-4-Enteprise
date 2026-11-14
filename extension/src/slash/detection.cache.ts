/**
 * DetectionCache
 *
 * Caches detection results between pipeline runs (TDD §1.5: TTL 5 min).
 * Entries live in <root>/.code-intel/design-gate/cache/{sha}.json where
 * sha = sha256(relativeSourcePath + ":" + mode); audit records ({runId}.json)
 * are owned by report.store.ts. Entry `runId` is the real run that produced
 * the findings (never a path); `sourcePath` is stored workspace-relative.
 */

import * as fs from "fs";
import * as path from "path";

import { DetectionResult, DetectionError } from "./types";
import { logRedacted } from "./path-redactor";
import { sanitizeFindings } from "./report.scoring";
import {
  designGateDir, ensureDirInside, listRunIds, sha256, toRelSource, writeJsonAtomic,
} from "./report.store";

type Mode = "static" | "rendered" | "both";

const CACHE_SUBDIR = "cache";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes per TDD §1.5
const SHA_FILE_RE = /^[a-f0-9]{64}\.json$/;

interface CacheEntry { timestamp: number; runId: string; result: DetectionResult }

/** Cached findings plus the run that produced them. */
export interface CachedResult { result: DetectionResult; runId: string }

// In-memory layer, keyed by root + hash so workspaces never mix.
const memoryCache = new Map<string, CacheEntry>();

function cacheDir(root: string): string {
  return path.join(designGateDir(root), CACHE_SUBDIR);
}

/** Absolute or relative sourcePath → workspace-relative form. */
function relOf(root: string, sourcePath: string): string {
  return path.isAbsolute(sourcePath) ? toRelSource(root, sourcePath) : sourcePath;
}

function keyOf(root: string, sourcePath: string, mode: Mode): string {
  return sha256(`${relOf(root, sourcePath)}:${mode}`);
}

function isFresh(entry: CacheEntry): boolean {
  return Date.now() - entry.timestamp < CACHE_TTL;
}

function isValidEntry(e: unknown): e is CacheEntry {
  const c = e as CacheEntry | undefined;
  return !!c && typeof c.timestamp === "number" && typeof c.runId === "string" && !!c.result;
}

/**
 * Save a result (memory + atomic JSON file).
 * A file-write failure is logged and the memory entry still serves this process.
 */
export function cacheResult(
  root: string, sourcePath: string, mode: Mode, result: DetectionResult, runId: string
): void {
  const key = keyOf(root, sourcePath, mode);
  // D1: the entry never holds absolute paths — findings are stored workspace-relative.
  const stored: DetectionResult = { ...result, findings: sanitizeFindings(result.findings, root) };
  const entry: CacheEntry = { timestamp: Date.now(), runId, result: stored };
  memoryCache.set(`${root}|${key}`, entry);
  try {
    ensureDirInside(root, cacheDir(root));
    writeJsonAtomic(path.join(cacheDir(root), `${key}.json`), {
      schema: 1, sourcePath: relOf(root, sourcePath), mode, ...entry,
    });
  } catch (error) {
    logRedacted("error", `Failed to cache result: ${(error as Error).message}`, root);
  }
}

function readEntryFile(file: string, root: string): CacheEntry | undefined {
  if (!fs.existsSync(file)) return undefined;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
    return isValidEntry(parsed) ? parsed : undefined;
  } catch (error) {
    logRedacted("error", `Failed to parse cache file: ${(error as Error).message}`, root);
    return undefined;
  }
}

/** Fresh cached result (+ originating runId), or undefined on miss/expiry. */
export function getCachedResult(root: string, sourcePath: string, mode: Mode): CachedResult | undefined {
  const key = keyOf(root, sourcePath, mode);
  const memKey = `${root}|${key}`;
  const entry = memoryCache.get(memKey) ?? readEntryFile(path.join(cacheDir(root), `${key}.json`), root);
  if (!entry || !isFresh(entry)) return undefined;
  memoryCache.set(memKey, entry);
  return { result: entry.result, runId: entry.runId };
}

function removeFile(file: string, root: string): void {
  try {
    fs.rmSync(file, { force: true });
  } catch (error) {
    logRedacted("error", `Failed to remove cache file: ${(error as Error).message}`, root);
  }
}

/** Invalidate one (sourcePath, mode) entry, or every cache entry when mode is omitted. */
export function invalidateCache(root: string, sourcePath: string, mode?: Mode): void {
  if (!mode) {
    clearAllCache(root);
    return;
  }
  const key = keyOf(root, sourcePath, mode);
  memoryCache.delete(`${root}|${key}`);
  removeFile(path.join(cacheDir(root), `${key}.json`), root);
}

/** Remove cache entries and run records for this root — nothing else. */
export function clearAllCache(root: string): void {
  for (const k of [...memoryCache.keys()]) {
    if (k.startsWith(`${root}|`)) memoryCache.delete(k);
  }
  const cdir = cacheDir(root);
  if (fs.existsSync(cdir)) {
    fs.readdirSync(cdir).filter((f) => SHA_FILE_RE.test(f)).forEach((f) => removeFile(path.join(cdir, f), root));
  }
  listRunIds(root).forEach((id) => removeFile(path.join(designGateDir(root), `${id}.json`), root));
}

/** Persisted runs (from {runId}.json records), newest first. */
export function listCachedRuns(root: string): Array<{ runId: string; timestamp: number }> {
  return listRunIds(root)
    .map((runId) => ({ runId, timestamp: recordTimestamp(root, runId) }))
    .sort((a, b) => b.timestamp - a.timestamp);
}

function recordTimestamp(root: string, runId: string): number {
  try {
    const raw = fs.readFileSync(path.join(designGateDir(root), `${runId}.json`), "utf-8");
    return Number(JSON.parse(raw).timestamp) || 0;
  } catch (error) {
    logRedacted("error", `Failed to read run record ${runId}: ${(error as Error).message}`, root);
    return 0;
  }
}

// Export the enum for use in tests
export { DetectionError };
