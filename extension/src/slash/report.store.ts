/**
 * ReportStore — durable audit records for design-gate runs (BR-12).
 *
 * Layout under <root>/.code-intel/design-gate/:
 *   {runId}.json      report record (this module)
 *   cache/{sha}.json  detection cache (detection.cache.ts)
 *
 * SEC-F05: RUN_ID_RE is the only accepted runId shape; every path built from
 * a runId is containment-checked. SEC-F04: writes are atomic (tmp + rename).
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

import type { QualityReport } from "./types";
import { isPathWithinRoot } from "../services/PathResolver";
import { logRedacted } from "./path-redactor";

/** Single accepted runId shape: run_<ms>_<[a-z0-9]+>. */
export const RUN_ID_RE = /^run_\d+_[a-z0-9]+$/;
const MAX_RUN_ID_LEN = 64;
const STORE_DIR = ".code-intel/design-gate";

/** Extra context stored beside the report. */
export interface ReportMeta {
  /** Workspace-relative source path (never absolute). */
  sourcePath: string;
  cacheHit: boolean;
  /** Run that produced the cached findings (cache-hit only). */
  sourceRunId?: string;
}

/** True only for well-formed runIds (SEC-F05). */
export function isValidRunId(id: unknown): id is string {
  return typeof id === "string" && id.length <= MAX_RUN_ID_LEN && RUN_ID_RE.test(id);
}

/** Absolute design-gate store directory for a workspace root. */
export function designGateDir(root: string): string {
  return path.join(root, STORE_DIR);
}

/** Resolve `name` inside `dir`; undefined if it would escape (containment). */
export function resolveInside(dir: string, name: string): string | undefined {
  if (name.includes("\0")) return undefined;
  const resolved = path.resolve(dir, name);
  const base = path.resolve(dir);
  return resolved !== base && isPathWithinRoot(base, resolved) ? resolved : undefined;
}

/** Workspace-relative path with forward slashes; "." for the root itself. */
export function toRelSource(root: string, abs: string): string {
  const rel = path.relative(root, abs).split(path.sep).join("/");
  return rel === "" ? "." : rel;
}

/** sha256 hex of a string (cache key helper). */
export function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

/**
 * Create `dir` and verify its real location is still inside `root`
 * (rejects a `.code-intel` symlink pointing elsewhere).
 */
export function ensureDirInside(root: string, dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  if (!isPathWithinRoot(fs.realpathSync(root), fs.realpathSync(dir))) {
    throw new Error("design-gate directory escapes workspace root");
  }
}

/** Atomic JSON write: tmp file in the same dir, then rename. Cleans tmp on failure. */
export function writeJsonAtomic(file: string, data: unknown): void {
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { flag: "wx", mode: 0o600 });
    fs.renameSync(tmp, file);
  } catch (error) {
    fs.rmSync(tmp, { force: true });
    throw error;
  }
}

/** Persist a report record as {runId}.json. Throws on invalid runId or I/O error. */
export function saveReport(root: string, report: QualityReport, meta: ReportMeta): void {
  if (!isValidRunId(report.runId)) throw new Error("invalid runId");
  const dir = designGateDir(root);
  ensureDirInside(root, dir);
  const file = resolveInside(dir, `${report.runId}.json`);
  if (!file) throw new Error("report path escapes store");
  writeJsonAtomic(file, {
    schema: 1,
    runId: report.runId,
    sourcePath: meta.sourcePath,
    detectionMode: report.detectionMode,
    timestamp: Date.now(),
    cacheHit: meta.cacheHit,
    ...(meta.sourceRunId ? { sourceRunId: meta.sourceRunId } : {}),
    report,
  });
}

/**
 * Load a report by runId. Invalid or unknown ids both yield undefined
 * (no oracle for probing the filesystem).
 */
export function loadReport(root: string, runId: string): QualityReport | undefined {
  if (!isValidRunId(runId)) return undefined;
  const file = resolveInside(designGateDir(root), `${runId}.json`);
  if (!file || !fs.existsSync(file)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"))?.report as QualityReport | undefined;
  } catch (error) {
    logRedacted("error", `Failed to read report ${runId}: ${(error as Error).message}`, root);
    return undefined;
  }
}

/** runIds that have a record on disk. */
export function listRunIds(root: string): string[] {
  const dir = designGateDir(root);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -".json".length))
    .filter(isValidRunId);
}

/**
 * Save a report; never throws. Returns undefined on success, otherwise a
 * message the caller must surface (no silent loss of the audit record).
 */
export function persistRun(root: string, report: QualityReport, meta: ReportMeta): string | undefined {
  try {
    saveReport(root, report, meta);
    return undefined;
  } catch (error) {
    logRedacted("error", `Failed to persist report ${report.runId}: ${(error as Error).message}`, root);
    return "report not persisted: could not write audit record";
  }
}
