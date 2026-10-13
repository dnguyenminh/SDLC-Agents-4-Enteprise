/**
 * SA4E-360 — light index freshness guardrail (TDD §5.5, FSD §5.4).
 *
 * stat → hash → reindex ladder with a session-scoped lastKnownGoodMtime map:
 * the hot path is exactly ONE stat per file (FRS-01); only mtime-changed files
 * are hash-confirmed against the index `files.content_hash` (no index mtime
 * column — DISC-4); only hash-differing files trigger the on-demand re-index
 * delegate (backend checksum-skip makes it changed-files-only), retried at
 * most ONCE (UT-08/UT-09). A cooldown (SEC-360-03 remediation #2) blocks
 * repeated re-index bursts within the window (UT-10). Never throws — the
 * caller degrades instead of blocking the session (BR-360-03).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'crypto';
import { logger } from '../../logger.js';
import type { FreshnessAction, FreshnessReport, FreshnessStatus, IndexedFileInfo } from './skeleton-types.js';

/** Default cooldown between re-index delegate calls (SEC-360-03 #2). */
export const REINDEX_COOLDOWN_MS = 30_000;

export interface FreshnessDeps {
  /** On-demand re-index delegate (code_index_status {reindex:true} chain). */
  reindex: () => Promise<boolean>;
  /** Current content hash of a workspace file (default sha256 of the bytes). */
  hashFile?: (absolutePath: string) => string | undefined;
  /** Injected stat for tests (default fs.statSync mtimeMs; undefined = missing). */
  statFile?: (absolutePath: string) => { mtimeMs: number } | undefined;
  /** Index content-hash lookup for the single-file hot path (checkFile). */
  indexedHash?: (root: string, relativePath: string) => string | undefined;
  /** Injected clock for cooldown tests (default Date.now). */
  now?: () => number;
  /** Cooldown window between delegate calls (default 30s). */
  cooldownMs?: number;
  /** Pre-seeded lastKnownGoodMtime map (absolute path → mtimeMs) — session state. */
  initialMtimes?: ReadonlyMap<string, number>;
  /** Telemetry sink for PI_SKELETON_INDEX_STALE (warn). */
  emit?: (event: string, payload: { staleFiles: number; action: FreshnessAction }) => void;
}

export class IndexFreshnessChecker {
  private readonly baseline = new Map<string, number>();
  private lastReindexAt = -Infinity;

  constructor(private readonly deps: FreshnessDeps) {
    for (const [p, mtime] of deps.initialMtimes ?? []) this.baseline.set(p, mtime);
  }

  /**
   * Sweeps the indexed files (1 stat each) and recovers staleness:
   * re-index once → re-check → FRESH, else DEGRADED. Never throws.
   */
  async sweep(root: string, indexedFiles: readonly IndexedFileInfo[]): Promise<FreshnessReport> {
    const stale: IndexedFileInfo[] = [];
    const files = new Map<string, FreshnessStatus>();
    for (const info of indexedFiles) {
      const absolutePath = path.join(root, info.relativePath);
      const status = this.statAndConfirm(absolutePath, info.contentHash);
      files.set(absolutePath, status);
      if (status === 'STALE') stale.push(info);
    }
    if (stale.length === 0) return { status: 'FRESH', action: 'none', staleFiles: [], files };
    const action = await this.recover(root, stale, files);
    const status: FreshnessStatus = action === 'reindex' ? 'FRESH' : 'DEGRADED';
    return { status, action, staleFiles: stale.map((s) => s.relativePath), files };
  }

  /**
   * read_method hot path: 1 stat; mtime-unchanged ⇒ FRESH; changed ⇒ hash
   * confirm → re-index once (cooldown-aware) → FRESH or DEGRADED.
   */
  async checkFile(root: string, relativePath: string): Promise<FreshnessStatus> {
    const absolutePath = path.join(root, relativePath);
    const indexHash = this.deps.indexedHash?.(root, relativePath);
    const first = this.statAndConfirm(absolutePath, indexHash);
    if (first !== 'STALE') return first;
    const files = new Map<string, FreshnessStatus>([[absolutePath, 'STALE']]);
    const action = await this.recover(root, [{ relativePath, contentHash: indexHash }], files);
    return action === 'reindex' ? (files.get(absolutePath) ?? 'FRESH') : 'DEGRADED';
  }

  /** Seeds the baseline from a stat sweep (session start trusts the index). */
  seed(root: string, indexedFiles: readonly IndexedFileInfo[]): void {
    for (const info of indexedFiles) {
      const absolutePath = path.join(root, info.relativePath);
      const stat = (this.deps.statFile ?? defaultStat)(absolutePath);
      if (stat) this.baseline.set(absolutePath, stat.mtimeMs);
    }
  }

  /** Test hook — clears the session baseline (simulates a new session). */
  reset(): void {
    this.baseline.clear();
    this.lastReindexAt = -Infinity;
  }

  /** 1 stat + hash-confirm-on-change for one file; seeds the baseline when unseen. */
  private statAndConfirm(absolutePath: string, contentHash: string | undefined): FreshnessStatus {
    const stat = (this.deps.statFile ?? defaultStat)(absolutePath);
    const known = this.baseline.get(absolutePath);
    if (stat === undefined) return 'STALE'; // indexed but gone from disk
    if (known === undefined) {
      this.baseline.set(absolutePath, stat.mtimeMs); // first sighting seeds — trust the index
      return 'FRESH';
    }
    if (stat.mtimeMs === known) return 'FRESH'; // hot path: 1 stat, 0 hash
    const currentHash = (this.deps.hashFile ?? defaultHash)(absolutePath);
    if (contentHash !== undefined && currentHash === contentHash) {
      this.baseline.set(absolutePath, stat.mtimeMs); // touch-only: refresh, no reindex
      return 'FRESH';
    }
    return 'STALE';
  }

  /** One delegate attempt (cooldown-aware), then ONE re-check — never a loop. */
  private async recover(
    root: string,
    stale: readonly IndexedFileInfo[],
    files: Map<string, FreshnessStatus>
  ): Promise<FreshnessAction> {
    const now = this.deps.now ?? Date.now;
    const cooldownMs = this.deps.cooldownMs ?? REINDEX_COOLDOWN_MS;
    let action: FreshnessAction;
    if (now() - this.lastReindexAt < cooldownMs) {
      action = 'cooldown'; // SEC-360-03: only ONE reindex per cooldown window
    } else {
      this.lastReindexAt = now();
      action = (await this.runDelegate()) ? 'reindex' : 'degrade';
    }
    for (const info of stale) {
      const absolutePath = path.join(root, info.relativePath);
      if (action === 'reindex') {
        const stat = (this.deps.statFile ?? defaultStat)(absolutePath);
        if (stat) {
          this.baseline.set(absolutePath, stat.mtimeMs);
          files.set(absolutePath, 'FRESH');
          continue;
        }
      }
      files.set(absolutePath, 'DEGRADED');
    }
    this.report(stale.length, action === 'reindex' ? 'reindex' : 'degrade');
    return action;
  }

  /** Delegate call isolated from decision logic; a throw counts as failure. */
  private async runDelegate(): Promise<boolean> {
    try {
      return await this.deps.reindex();
    } catch (err) {
      logger.warn('PI_SKELETON_REINDEX_FAILED', { error: (err as Error).message });
      return false;
    }
  }

  /** Single PI_SKELETON_INDEX_STALE warn per sweep (TDD §11.1 payload shape). */
  private report(staleFiles: number, action: FreshnessAction): void {
    this.deps.emit?.('PI_SKELETON_INDEX_STALE', { staleFiles, action });
    logger.warn('PI_SKELETON_INDEX_STALE', { staleFiles, action });
  }
}

function defaultStat(absolutePath: string): { mtimeMs: number } | undefined {
  try {
    const st = fs.statSync(absolutePath);
    return { mtimeMs: st.mtimeMs };
  } catch {
    return undefined;
  }
}

function defaultHash(absolutePath: string): string | undefined {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(absolutePath)).digest('hex');
  } catch {
    return undefined;
  }
}
