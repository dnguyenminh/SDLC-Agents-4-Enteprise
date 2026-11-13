/**
 * SA4E-393 Addendum 5 — `WorktreeTrustService`: switch → cache → verifier → log (TDD E4.4).
 * Implements TrustPort. Logging: one `warn` per real verification, rate-limited to one
 * line per reason per 10 s with a suppressed counter; `repoRoot` only at `debug`;
 * every path passes the control-character sanitizer (T6).
 */
import { createHash } from 'crypto';
import { TrustCache } from './cache.js';
import { filterOpenFolders } from './config.js';
import { foldKey } from './path-fold.js';
import type { TrustDeps, TrustLogger, TrustPort, WorktreeVerdict } from './types.js';
import { verifyWorktree } from './verifier.js';

export interface TrustServiceOptions extends TrustDeps {
  /** Effective feature switch (env AND setting). */
  enabled(): boolean;
  logger: TrustLogger;
}

const LOG_WINDOW_MS = 10_000;
const clean = (v: string): string => String(v ?? '').replace(/[\r\n\0]/g, '?');

export class WorktreeTrustService implements TrustPort {
  private readonly cache: TrustCache;
  private readonly seen = new Map<string, { at: number; suppressed: number }>();

  constructor(private readonly o: TrustServiceOptions) {
    this.cache = new TrustCache(o.fs, o.now);
    o.logger.info({ enabled: o.enabled(), open_folders: this.openFoldersEffective().length }, 'worktree auto-trust initialised');
  }

  /** Open folders usable as parents (SEC-WT-11): existing dirs with a `.git` dir, not fs root / home. */
  openFoldersEffective(): string[] {
    return filterOpenFolders(this.o.openFolders(), this.o.fs, this.o.platform, this.o.homedir());
  }

  check(baseDir: string): WorktreeVerdict {
    if (!this.o.enabled()) return { trusted: false, reason: 'disabled' };
    const ctx = this.ctxSig();
    const key = foldKey(baseDir, this.o.platform);
    const hit = this.cache.get(key, ctx, baseDir);
    if (hit !== null) {
      this.o.logger.debug({ cached: true, trusted: hit.trusted }, 'worktree trust cache hit');
      return hit;
    }
    const t0 = this.o.now();
    const v = verifyWorktree(baseDir, { ...this.o, openFolders: () => this.openFoldersEffective() });
    this.cache.put(key, v, ctx, baseDir);
    this.logDecision(v, baseDir, this.o.now() - t0);
    return v;
  }

  private ctxSig(): string {
    const open = this.o.openFolders().map((f) => foldKey(f, this.o.platform)).join('|');
    // SEC-WT-24: allowlist changes must drop cached positives immediately (sha256 keeps the key short).
    const allow = this.o.allowlistRoots().map((r) => foldKey(r, this.o.platform)).sort().join('|');
    const allowHash = createHash('sha256').update(allow).digest('hex');
    return `${this.o.enabled()}|${open}|${allowHash}`;
  }

  private logDecision(v: WorktreeVerdict, baseDir: string, elapsed: number): void {
    const reason = v.trusted ? 'accepted' : v.reason;
    const n = this.throttle(reason);
    if (n === null) return;
    const base = { decision: v.trusted ? 'accepted' : 'rejected', trustSource: 'worktree', base_dir: clean(baseDir), cached: false, elapsed_ms: Math.round(elapsed), suppressed: n };
    if (v.trusted) {
      this.o.logger.warn({ ...base, kind: v.kind }, 'worktree base_dir accepted');
      this.o.logger.debug({ repo_root: clean(v.repoRoot) }, 'worktree trust repo root');
    } else {
      this.o.logger.warn({ ...base, reason: v.reason }, 'worktree base_dir rejected');
    }
  }

  /** Returns the suppressed count to report, or null when this line must be dropped. */
  private throttle(reason: string): number | null {
    const now = this.o.now();
    const s = this.seen.get(reason);
    if (s !== undefined && now - s.at < LOG_WINDOW_MS) { s.suppressed++; return null; }
    this.seen.set(reason, { at: now, suppressed: 0 });
    return s?.suppressed ?? 0;
  }
}
