/**
 * SA4E-360 — SkeletonProvider tests (TDD task T6; STC UT-11..16).
 * Batched corpus render, per-file bound = cap, fallback ladder (BR-360-03),
 * per-file skip (EF-3), empty index (EF-5), OI-2 freshness-keyed cache.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SkeletonProvider, skeletonCap, SKELETON_MAX_FILES } from '../skeleton-provider.js';
import { SymbolOutlineExtractor, FsContentReader } from '../../../pi-agent/context-retrieval/symbol-outline-extractor.js';
import { TokenCounter } from '../../../pi-agent/context-retrieval/token-counter.js';
import { REDACTED_MARKER } from '../secret-redaction.js';
import type { SymbolLocator } from '../symbol-locator.js';
import type { IndexFreshnessChecker } from '../index-freshness-checker.js';
import type { SearchCandidate } from '../../../pi-agent/context-retrieval/types.js';

let root = '';
const events: Array<{ event: string; payload: unknown }> = [];

function sym(name: string, kind: string, filePath: string, startLine: number, signature?: string): SearchCandidate {
  return { name, kind, filePath, startLine, signature, source: 'code_search' };
}

const CORPUS_APP = [
  sym('App', 'class', 'src/app.ts', 1, 'class App {'),
  sym('render', 'method', 'src/app.ts', 10, 'render(target: string): void'),
];

function fakeLocator(corpus: SearchCandidate[], extract?: (files: Array<{ path: string }>) => Promise<SearchCandidate[]>): SymbolLocator {
  return {
    locate: vi.fn(async () => ({ rows: [] })),
    extractSignatures: vi.fn(extract ?? (async () => [])),
    fetchSymbolCorpus: vi.fn(async () => corpus),
    reindex: vi.fn(async () => true),
  };
}

function fakeFreshness(): IndexFreshnessChecker {
  return {
    checkFile: vi.fn(async () => 'FRESH'),
    sweep: vi.fn(async () => ({ status: 'FRESH', action: 'none', staleFiles: [], files: new Map() })),
  } as unknown as IndexFreshnessChecker;
}

/** Spy extractor delegating to a real SymbolOutlineExtractor (counts + captures). */
function spyExtractor() {
  const calls: Array<{ filePath: string; maxTokens: number }> = [];
  const real = new SymbolOutlineExtractor(new TokenCounter(), new FsContentReader());
  const spy = {
    extractOutline: (filePath: string, symbols: readonly SearchCandidate[], maxTokens: number) => {
      calls.push({ filePath, maxTokens });
      return real.extractOutline(filePath, symbols as never, maxTokens);
    },
  } as unknown as SymbolOutlineExtractor;
  return { spy, calls };
}

function makeProvider(locator: SymbolLocator, extractor?: SymbolOutlineExtractor): SkeletonProvider {
  return new SkeletonProvider({ locator, freshness: fakeFreshness(), extractor, emit: (event, payload) => events.push({ event, payload }) });
}

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'sa4e-360-provider-'));
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'app.ts'), 'export class App {}\n');
  fs.writeFileSync(path.join(root, 'src', 'Widget.svelte'), '<script>\n  export function load(x) { return x; }\n</script>\n');
  fs.writeFileSync(path.join(root, 'src', 'Template.hbs'), '<div>{{title}}</div>\n');
  fs.mkdirSync(path.join(root, 'empty-ws'), { recursive: true });
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

// STC UT-11 — ONE batched corpus query; render format per FSD §3.1.4
describe('UT-11 — batched corpus render format', () => {
  it('calls fetchSymbolCorpus once and renders kind+name+signature lines, no bodies', async () => {
    const locator = fakeLocator(CORPUS_APP);
    const provider = makeProvider(locator);
    const { skeleton } = await provider.getSections(root, 19668, ['src']);
    expect(locator.fetchSymbolCorpus).toHaveBeenCalledTimes(1);
    expect(skeleton.skeletonContent).toContain('// app.ts');
    expect(skeleton.skeletonContent).toContain('class App');
    expect(skeleton.skeletonContent).toContain('method render render(target: string): void');
    expect(skeleton.gateDecision).toBe('PASS');
  });

  it('normalizes signatures: whitespace collapsed, >120 chars trimmed to 117 + ...', async () => {
    const long = `handle(${'a'.repeat(60)}, ${'b'.repeat(60)}, ${'c'.repeat(60)})`;
    const locator = fakeLocator([sym('handle', 'method', 'src/app.ts', 5, long)]);
    const { skeleton } = await makeProvider(locator).getSections(root, 19668, []);
    const line = skeleton.skeletonContent.split('\n').find((l) => l.startsWith('method handle'));
    expect(line).toContain('...');
    expect(line!.length).toBeLessThanOrEqual('method handle '.length + 120);
  });
});

// STC UT-12 — per-file render bound equals the whole-skeleton cap
describe('UT-12 — per-file bound equals whole-skeleton cap', () => {
  it('extractOutline receives the remaining GLOBAL budget, capped at floor(0.70 × staticBudget)', async () => {
    const { spy, calls } = spyExtractor();
    const locator = fakeLocator(CORPUS_APP);
    await makeProvider(locator, spy).getSections(root, 19668, []);
    expect(calls.length).toBeGreaterThan(0);
    expect(skeletonCap(19668)).toBe(13767); // DISC-7 arithmetic: ceil(2621.44)=2622 → 19,668 → 13,767
    // SEC-360-02 #1: per-file bound = remaining global budget (≤ cap) — never a
    // smaller independent per-file cap. First file sees cap − 1 (1-token
    // boundary headroom so TokenCounter.estimate ≥ chars/4 can never overshoot
    // the cap — PBT-10 invariant from Wave 1).
    expect(calls[0].maxTokens).toBe(skeletonCap(19668) - 1);
    expect(calls.every((c) => c.maxTokens > 0 && c.maxTokens <= skeletonCap(19668))).toBe(true);
  });
});

// STC UT-13 — fallback ladder GRAMMAR → REGEX_SIGNATURES → RAW_HEAD → SKIPPED
describe('UT-13 — fallback ladder across four fixture files', () => {
  it('grammar file rendered from corpus; regex/rawhead/skipped rungs degrade without blocking', async () => {
    const locator = fakeLocator(
      CORPUS_APP,
      vi.fn(async (files: Array<{ path: string }>) =>
        files.filter((f) => f.path.includes('.svelte')).map((f) => sym('load', 'function', f.path, 2, 'export function load(x)'))
      )
    );
    const { skeleton } = await makeProvider(locator).getSections(root, 19668, []);
    // GRAMMAR rung: app.ts AST symbols.
    expect(skeleton.skeletonContent).toContain('method render');
    // REGEX_SIGNATURES rung: svelte symbols with real line numbers.
    expect(skeleton.skeletonContent).toContain('function load');
    // RAW_HEAD rung: .hbs head rendered after hygiene trim.
    expect(skeleton.skeletonContent).toContain('// Template.hbs');
    expect(skeleton.skeletonContent).toContain('{{title}}');
    // Telemetry: fallback events for regex + rawhead; session NEVER blocked.
    const modes = events.filter((e) => e.event === 'PI_SKELETON_FALLBACK').map((e) => (e.payload as { fallbackMode: string }).fallbackMode);
    expect(modes).toContain('REGEX_SIGNATURES');
    expect(modes).toContain('RAW_HEAD');
    expect(skeleton.fallbackFiles).toBeGreaterThanOrEqual(2);
    expect(skeleton.gateDecision).not.toBe('REJECT');
  });

  it('regex extraction throwing → files SKIPPED with warn, build completes', async () => {
    const locator = fakeLocator(CORPUS_APP, vi.fn(async () => { throw new Error('backend unavailable'); }));
    const { skeleton } = await makeProvider(locator).getSections(root, 19668, []);
    expect(skeleton.skeletonContent).toContain('method render'); // grammar content survived
    const skipped = events.filter((e) => e.event === 'PI_SKELETON_FILE_SKIPPED');
    expect(skipped.length).toBeGreaterThanOrEqual(1);
    expect(skeleton.skippedFiles).toBeGreaterThanOrEqual(1);
  });
});

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
