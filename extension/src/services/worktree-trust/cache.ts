/* GENERATED from backend/src/shared/worktree-trust/cache.ts by scripts/sync-worktree-trust.mjs - DO NOT EDIT */
/**
 * SA4E-393 Addendum 5 — verdict cache (TDD E4.4 as amended by E11.6/E11.8).
 * Positive TTL 10 s / negative 5 s; separate FIFO buckets 128 / 64 so a flood of
 * rejections cannot evict accepted worktrees. Every hit re-validates disk evidence
 * (2 lstat + 1 realpath, 0 content reads): rewriting `.git` or the back-link, a
 * missing `.git`, or re-pointing base_dir at another directory forces re-verification.
 */
import * as path from 'path';
import { sigOf, statSig } from './git-files';
import type { FsLike, StatLike, TrustEvidence, WorktreeVerdict } from './types';

export const POSITIVE_TTL_MS = 10_000;
export const NEGATIVE_TTL_MS = 5_000;
export const POSITIVE_MAX = 128;
export const NEGATIVE_MAX = 64;

interface Entry { verdict: WorktreeVerdict; ctx: string; expiresAt: number; negGitPath?: string; negGitSig?: string }

export class TrustCache {
  private readonly pos = new Map<string, Entry>();
  private readonly neg = new Map<string, Entry>();

  /** @param sig stat-signature function (injectable for fake file systems). */
  constructor(
    private readonly fsx: FsLike,
    private readonly now: () => number,
    private readonly sig: (s: StatLike) => string = statSig,
  ) {}

  /** Returns a still-valid verdict or null (entry evicted when stale). */
  get(key: string, ctx: string, baseDir: string): WorktreeVerdict | null {
    const bucket = this.pos.has(key) ? this.pos : this.neg;
    const e = bucket.get(key);
    if (e === undefined) return null;
    if (this.now() >= e.expiresAt || e.ctx !== ctx || !this.evidenceHolds(e, baseDir)) {
      bucket.delete(key);
      return null;
    }
    return e.verdict;
  }

  /** Store a verdict; `baseDir` defaults to `key` (callers pass the unfolded path for negative signatures). */
  put(key: string, verdict: WorktreeVerdict, ctx: string, baseDir: string = key): void {
    this.pos.delete(key);
    this.neg.delete(key);
    const e: Entry = { verdict, ctx, expiresAt: this.now() + (verdict.trusted ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS) };
    if (verdict.trusted) return this.insert(this.pos, key, e, POSITIVE_MAX);
    e.negGitPath = path.join(baseDir, '.git');
    e.negGitSig = sigOf(this.fsx, e.negGitPath, this.sig);
    this.insert(this.neg, key, e, NEGATIVE_MAX);
  }

  sizes(): { positive: number; negative: number } { return { positive: this.pos.size, negative: this.neg.size }; }

  private insert(bucket: Map<string, Entry>, key: string, e: Entry, max: number): void {
    if (bucket.size >= max) bucket.delete(bucket.keys().next().value as string); // FIFO
    bucket.set(key, e);
  }

  private evidenceHolds(e: Entry, baseDir: string): boolean {
    const v = e.verdict;
    if (!v.trusted) return sigOf(this.fsx, e.negGitPath!, this.sig) === e.negGitSig;
    return this.positiveHolds(v.evidence, baseDir);
  }

  private positiveHolds(ev: TrustEvidence, baseDir: string): boolean {
    if (sigOf(this.fsx, ev.gitPath, this.sig) !== ev.gitSig) return false;
    if (sigOf(this.fsx, ev.linkPath, this.sig) !== ev.linkSig) return false;
    try { return this.fsx.realpath(baseDir) === ev.realBase; } catch { return false; }
  }
}
