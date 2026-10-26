/**
 * CleanupSweep — OI-15 periodic orphan reaper (TDD §9.2, BRD STORY 3 RD-8).
 *
 * Safety net for artifacts that escaped immediate cleanup (OI-14): crashes,
 * power loss, permission errors. Per tick it scans ONLY the dedicated
 * ARTIFACT_OUTPUT_ROOTS (SECURITY-REVIEW approval condition 2 — never the raw
 * OS temp root, never the agent workspace). Roots are dedicated artifact
 * sinks, so EVERY regular non-symlink file older than the TTL is swept —
 * including job-dir nesting (`<root>/<job>/file`, how markdown-exporter
 * writes) and arbitrary names (`STP-v1-SA4E-380.docx`); filename prefixes
 * are NOT a criterion. Directories, symlinks, young files and anything
 * outside the roots are always kept. Job directories emptied by the sweep
 * are removed too. Each run is hard-bounded by maxRunMs and logs one
 * summary line `{ removed, failed, skipped, durationMs }` with basenames only.
 *
 * Lifecycle: started/stopped next to the health monitor (OrchestrationModule);
 * `enabled: false` never starts a timer.
 */

import type { Logger } from 'pino';
import * as fs from 'fs';
import * as path from 'path';
import { artifactOutputRoots } from '../../../config/ContentProxy.js';
import { loadArtifactCleanupConfig, type ArtifactCleanupConfig } from './cleanup-config.js';

export interface SweepResult {
  removed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  /** True when the tick stopped early because maxRunMs elapsed (UT-48). */
  bounded: boolean;
}

export interface CleanupSweepDeps {
  /** Overrides loaded on top of the env-derived config (tests, ops). */
  config?: Partial<ArtifactCleanupConfig>;
  /** Scan roots override (tests); defaults to the configured artifact roots. */
  roots?: readonly string[];
  /** Deletion hook override (tests); defaults to fs.unlinkSync. */
  removeFile?: (filePath: string) => void;
}

export class CleanupSweep {
  private readonly logger: Logger;
  private readonly config: ArtifactCleanupConfig;
  private readonly roots: readonly string[];
  private readonly removeFile: (filePath: string) => void;
  private timer?: NodeJS.Timeout;

  constructor(logger: Logger, deps: CleanupSweepDeps = {}) {
    this.logger = logger.child({ component: 'CleanupSweep' });
    this.config = { ...loadArtifactCleanupConfig(), ...deps.config };
    this.roots = deps.roots ?? artifactOutputRoots();
    this.removeFile = deps.removeFile ?? ((filePath) => fs.unlinkSync(filePath));
  }

  /** Start the interval timer; no-op when disabled or already running. */
  start(): void {
    if (!this.config.enabled || this.timer) return;
    this.timer = setInterval(() => this.runTick(), this.config.intervalMs);
    this.timer.unref?.();
    this.logger.info(
      { intervalMs: this.config.intervalMs, ttlMs: this.config.ttlMs, roots: this.roots.length },
      'Artifact cleanup sweep started',
    );
  }

  /** Stop the timer (idempotent). */
  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
    this.logger.info('Artifact cleanup sweep stopped');
  }

  /** Run one bounded sweep tick across all configured roots. */
  runOnce(): SweepResult {
    const startedAt = Date.now();
    const deadline = startedAt + this.config.maxRunMs;
    const now = Date.now();
    const result: SweepResult = { removed: 0, failed: 0, skipped: 0, durationMs: 0, bounded: false };

    for (const root of this.roots) {
      if (!this.scanRoot(root, now, deadline, result)) {
        result.bounded = true;
        break;
      }
    }

    result.durationMs = Date.now() - startedAt;
    this.logger.info(
      { removed: result.removed, failed: result.failed, skipped: result.skipped, durationMs: result.durationMs },
      'Artifact cleanup sweep tick completed',
    );
    if (result.bounded) this.logger.warn({ maxRunMs: this.config.maxRunMs }, 'Artifact cleanup sweep stopped at maxRunMs bound');
    return result;
  }

  /** @returns false when the maxRunMs deadline was reached mid-scan. */
  private scanRoot(root: string, now: number, deadline: number, result: SweepResult): boolean {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch (err) {
      this.logger.debug({ err }, 'Artifact cleanup sweep skipped unreadable root');
      return true;
    }
    for (const entry of entries) {
      if (Date.now() >= deadline) return false;
      if (entry.isDirectory() && !entry.isSymbolicLink()) {
        // Child job dirs nest one level: <root>/<job>/<artifact>. Sweep their
        // files, then remove the dir when the sweep emptied it.
        const jobDir = path.join(root, entry.name);
        if (!this.scanJobDir(jobDir, now, deadline, result)) return false;
        this.removeDirIfEmpty(jobDir, result);
      } else {
        this.sweepEntry(root, entry, now, result);
      }
    }
    return true;
  }

  /** @returns false when the maxRunMs deadline was reached mid-scan. */
  private scanJobDir(jobDir: string, now: number, deadline: number, result: SweepResult): boolean {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(jobDir, { withFileTypes: true });
    } catch (err) {
      this.logger.debug({ err }, 'Artifact cleanup sweep skipped unreadable job dir');
      return true;
    }
    for (const entry of entries) {
      if (Date.now() >= deadline) return false;
      this.sweepEntry(jobDir, entry, now, result);
    }
    return true;
  }

  private removeDirIfEmpty(jobDir: string, result: SweepResult): void {
    try {
      const remaining = fs.readdirSync(jobDir);
      if (remaining.length === 0) {
        fs.rmdirSync(jobDir);
        result.removed += 1;
      }
    } catch {
      // Non-empty or locked job dir stays — the next tick re-evaluates.
    }
  }

  private sweepEntry(dir: string, entry: fs.Dirent, now: number, result: SweepResult): void {
    const filePath = path.join(dir, entry.name);
    if (!this.isCandidate(entry)) {
      result.skipped += 1;
      return;
    }
    try {
      const stat = fs.lstatSync(filePath);
      if (now - stat.mtimeMs <= this.config.ttlMs) {
        result.skipped += 1;
        return;
      }
      this.removeFile(filePath);
      result.removed += 1;
    } catch (err) {
      result.failed += 1;
      this.logger.warn({ artifact: entry.name, err }, 'Artifact cleanup sweep failed to remove file');
    }
  }

  /** Inside dedicated roots every regular non-symlink file qualifies — the
   *  confinement boundary is the safety criterion, not the file name. */
  private isCandidate(entry: fs.Dirent): boolean {
    return entry.isFile() && !entry.isSymbolicLink();
  }

  private runTick(): void {
    try {
      this.runOnce();
    } catch (err) {
      this.logger.error({ err }, 'Artifact cleanup sweep tick failed');
    }
  }
}
