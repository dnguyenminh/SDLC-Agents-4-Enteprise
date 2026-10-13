/**
 * SA4E-360 — IndexFreshnessChecker unit tests (TDD task T2; STC UT-06..UT-10).
 * Fixture data: documents/SA4E-360/testdata/index-freshness-testdata.csv
 * (FRS-01..FRS-05). All fs access is injected (fake stat/hash) — UT, not IT.
 */
import { describe, it, expect, vi } from 'vitest';
import * as path from 'node:path';
import { IndexFreshnessChecker, REINDEX_COOLDOWN_MS } from '../index-freshness-checker.js';
import type { IndexedFileInfo } from '../skeleton-types.js';

interface FakeFs {
  stat: (p: string) => { mtimeMs: number } | undefined;
  hash: (p: string) => string | undefined;
}

/** Builds an injectable fake fs: 5 files, per-file controllable mtime/hash. */
function fakeFs(root: string, count = 5): FakeFs & {
  files: IndexedFileInfo[];
  set: (i: number, mtime: number, hash: string) => void;
  initialMtimes: Map<string, number>;
} {
  const state = new Map<string, { mtimeMs: number; hash: string }>();
  const files: IndexedFileInfo[] = [];
  const initialMtimes = new Map<string, number>();
  for (let i = 0; i < count; i++) {
    const rel = `src/f${i}.ts`;
    // Keys built with path.join so they match the checker's lookups exactly.
    const abs = path.join(root, rel);
    state.set(abs, { mtimeMs: 1_000 + i, hash: `hash-${i}` });
    files.push({ relativePath: rel, contentHash: `hash-${i}` });
    initialMtimes.set(abs, 1_000 + i);
  }
  return {
    files,
    set: (i, mtimeMs, hash) => state.set(path.join(root, `src/f${i}.ts`), { mtimeMs, hash }),
    stat: (p) => state.get(p),
    hash: (p) => state.get(p)?.hash,
    initialMtimes,
  };
}

function make(
  deps: Partial<ConstructorParameters<typeof IndexFreshnessChecker>[0]> & { reindex: () => Promise<boolean> }
) {
  const emit = vi.fn();
  const checker = new IndexFreshnessChecker({ emit, ...deps });
  return { checker, emit };
}

describe('IndexFreshnessChecker (SA4E-360 T2)', () => {
  const root = 'C:/ws/fresh';

  // STC UT-06 — fresh hot path: exactly 1 stat per file, 0 hash, 0 reindex (FRS-01)
  it('reports FRESH for unchanged files with exactly 1 stat and no hash/reindex', async () => {
    const f = fakeFs(root);
    const stat = vi.fn(f.stat);
    const hash = vi.fn(f.hash);
    const reindex = vi.fn(async () => true);
    const { checker } = make({ reindex, statFile: stat, hashFile: hash, initialMtimes: f.initialMtimes });
    const report = await checker.sweep(root, f.files);
    expect(report.status).toBe('FRESH');
    expect(report.action).toBe('none');
    expect(stat).toHaveBeenCalledTimes(5);
    expect(hash).not.toHaveBeenCalled();
    expect(reindex).not.toHaveBeenCalled();
  });

  // STC UT-07 — touch-only change: hash equal → FRESH without reindex (FRS-02)
  it('confirms touch-only changes by hash and skips the re-index delegate', async () => {
    const f = fakeFs(root);
    f.set(2, 9_999, 'hash-2'); // mtime moved, content identical
    const reindex = vi.fn(async () => true);
    const { checker } = make({ reindex, statFile: f.stat, hashFile: f.hash, initialMtimes: f.initialMtimes });
    const report = await checker.sweep(root, f.files);
    expect(report.status).toBe('FRESH');
    expect(report.action).toBe('none');
    expect(reindex).not.toHaveBeenCalled();
    // Baseline refreshed for the touched file only: a follow-up sweep is all-FRESH hot path.
    const again = await checker.sweep(root, f.files);
    expect(again.status).toBe('FRESH');
    expect(again.action).toBe('none');
  });

  // STC UT-08 — content changed → reindex changed files only → retry once → FRESH (FRS-03)
  it('re-indexes once on content change and recovers to FRESH', async () => {
    const f = fakeFs(root);
    f.set(1, 5_000, 'hash-1-CHANGED');
    const reindex = vi.fn(async () => {
      f.set(1, 5_000, 'hash-1'); // backend re-index converges index to disk
      return true;
    });
    const { checker, emit } = make({ reindex, statFile: f.stat, hashFile: f.hash, initialMtimes: f.initialMtimes });
    const report = await checker.sweep(root, f.files);
    expect(reindex).toHaveBeenCalledTimes(1);
    expect(report.status).toBe('FRESH');
    expect(report.action).toBe('reindex');
    expect(emit).toHaveBeenCalledWith('PI_SKELETON_INDEX_STALE', { staleFiles: 1, action: 'reindex' });
    expect(emit).toHaveBeenCalledTimes(1);
  });

  // STC UT-09 — reindex failure → DEGRADED, exactly 1 delegate call (FRS-04)
  it('degrades without a second retry when the re-index delegate fails', async () => {
    const f = fakeFs(root);
    f.set(3, 7_000, 'hash-3-CHANGED');
    const reindex = vi.fn(async () => false);
    const { checker, emit } = make({ reindex, statFile: f.stat, hashFile: f.hash, initialMtimes: f.initialMtimes });
    const report = await checker.sweep(root, f.files);
    expect(reindex).toHaveBeenCalledTimes(1);
    expect(report.action).toBe('degrade');
    expect(report.status).toBe('DEGRADED');
    expect(emit).toHaveBeenCalledWith('PI_SKELETON_INDEX_STALE', { staleFiles: 1, action: 'degrade' });
  });

  it('treats a throwing delegate the same as a failed one (never crashes the sweep)', async () => {
    const f = fakeFs(root);
    f.set(0, 8_000, 'hash-0-CHANGED');
    const reindex = vi.fn(async () => {
      throw new Error('backend down');
    });
    const { checker } = make({ reindex, statFile: f.stat, hashFile: f.hash, initialMtimes: f.initialMtimes });
    const report = await checker.sweep(root, f.files);
    expect(report.status).toBe('DEGRADED');
    expect(reindex).toHaveBeenCalledTimes(1);
  });

  // STC UT-10 — re-index cooldown: repeated stale events trigger ONE reindex (FRS-05)
  it('blocks repeat re-index calls within the 30s cooldown window', async () => {
    const f = fakeFs(root);
    let clock = 1_000_000;
    const reindex = vi.fn(async () => {
      f.set(4, clock, 'hash-4'); // converge, but the file can change again immediately
      return true;
    });
    const { checker } = make({
      reindex,
      statFile: f.stat,
      hashFile: f.hash,
      now: () => clock,
      cooldownMs: REINDEX_COOLDOWN_MS,
      initialMtimes: f.initialMtimes,
    });
    f.set(4, clock + 1, 'hash-4-CHANGED-A');
    clock += 10;
    const first = await checker.sweep(root, f.files);
    expect(first.action).toBe('reindex');
    expect(reindex).toHaveBeenCalledTimes(1);
    // Second stale event within the cooldown → blocked, still exactly 1 delegate call.
    f.set(4, clock + 1, 'hash-4-CHANGED-B');
    clock += 10;
    const second = await checker.sweep(root, f.files);
    expect(second.action).toBe('cooldown');
    expect(reindex).toHaveBeenCalledTimes(1);
    // After the cooldown elapses the delegate is allowed again.
    f.set(4, clock + 1, 'hash-4-CHANGED-C');
    clock += REINDEX_COOLDOWN_MS + 1;
    const third = await checker.sweep(root, f.files);
    expect(third.action).toBe('reindex');
    expect(reindex).toHaveBeenCalledTimes(2);
  });

  it('marks a file missing from disk as STALE (indexed but deleted)', async () => {
    const f = fakeFs(root);
    const stat = vi.fn((p: string) => (p.endsWith('f1.ts') ? undefined : f.stat(p)));
    const reindex = vi.fn(async () => true);
    const { checker } = make({ reindex, statFile: stat as never, hashFile: f.hash, initialMtimes: f.initialMtimes });
    const report = await checker.sweep(root, f.files);
    expect(report.staleFiles).toEqual(['src/f1.ts']);
    expect(reindex).toHaveBeenCalledTimes(1);
  });
});
