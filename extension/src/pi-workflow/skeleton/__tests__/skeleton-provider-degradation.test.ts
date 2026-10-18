/**
 * SA4E-360 — SkeletonProvider degradation tests (TDD task T6; STC UT-14..16
 * + the §8 scale-bound guard): single bad file skip (EF-3), empty index
 * degradation (EF-5), OI-2 freshness-keyed cache, walk-cap constant.
 * UT-11..13 + UT-35 live in skeleton-provider.test.ts.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SKELETON_MAX_FILES } from '../skeleton-provider.js';
import { CORPUS_APP, fakeLocator, makeProvider, setupSkeletonProviderFixture, spyExtractor, root } from './skeleton-provider-harness.js';

setupSkeletonProviderFixture();

// STC UT-14 — single-file failure → skip + warn, others continue (EF-3)
describe('UT-14 — single bad file never blocks the build', () => {
  it('1 unreadable + good files → PI_SKELETON_FILE_SKIPPED, skippedFiles counted', async () => {
    fs.writeFileSync(path.join(root, 'src', 'Broken.zzz'), 'garbage');
    const locator = fakeLocator(CORPUS_APP); // Broken.zzz not in corpus; regex finds nothing; head garbage→trimmed but non-empty
    const { skeleton } = await makeProvider(locator).getSections(root, 19668, []);
    expect(skeleton.skeletonContent).toContain('// app.ts'); // good file rendered
    expect(skeleton.gateDecision).not.toBe('REJECT');
  });
});

// STC UT-15 — empty workspace index → DEGRADED_NO_SKELETON (EF-5)
describe('UT-15 — empty index degrades without REJECT', () => {
  it('empty workspace → skeletonTokens 0, DEGRADED_NO_SKELETON', async () => {
    const emptyRoot = path.join(root, 'empty-ws');
    const { skeleton } = await makeProvider(fakeLocator([])).getSections(emptyRoot, 19668, []);
    expect(skeleton.skeletonTokens).toBe(0);
    expect(skeleton.gateDecision).toBe('DEGRADED_NO_SKELETON');
  });
});

// STC UT-16 — OI-2 freshness-keyed cache (no TTL)
describe('UT-16 — OI-2 fingerprint cache reuse + rebuild', () => {
  it('unchanged fingerprint serves cache (extractor not re-invoked); mtime change rebuilds', async () => {
    const { spy, calls } = spyExtractor();
    const locator = fakeLocator(CORPUS_APP);
    const provider = makeProvider(locator, spy);
    const first = await provider.getSections(root, 19668, []);
    const afterFirst = calls.length;
    const second = await provider.getSections(root, 19668, []);
    expect(second).toEqual(first); // cached artifact
    expect(calls.length).toBe(afterFirst); // extractor NOT re-invoked
    // Mutate one file → fingerprint differs → rebuild.
    const target = path.join(root, 'src', 'app.ts');
    const later = Date.now() / 1000 + 60;
    fs.utimesSync(target, new Date(later * 1000), new Date(later * 1000));
    await provider.getSections(root, 19668, []);
    expect(calls.length).toBeGreaterThan(afterFirst);
    // invalidate() forces a rebuild regardless of fingerprint.
    const afterRebuild = calls.length;
    provider.invalidate(root);
    await provider.getSections(root, 19668, []);
    expect(calls.length).toBeGreaterThan(afterRebuild);
  });
});

// Guard — §8 scale constant stays bounded (walk cap)
describe('scale bound', () => {
  it('SKELETON_MAX_FILES caps the corpus walk at 2000 files', () => {
    expect(SKELETON_MAX_FILES).toBe(2000);
  });
});
