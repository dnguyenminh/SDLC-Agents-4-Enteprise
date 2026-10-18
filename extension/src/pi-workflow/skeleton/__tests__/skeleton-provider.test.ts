/**
 * SA4E-360 — SkeletonProvider tests (TDD task T6; STC UT-11..13 + UT-35).
 * Batched corpus render, per-file bound = cap, fallback ladder (BR-360-03).
 * UT-35 (DEFECT-QA-01) is the F-1 regression guard: the REGEX_SIGNATURES rung
 * must sanitize candidates before outline rendering (SEC-360-01 vector 3/3).
 * UT-14/15/16 + scale bound live in skeleton-provider-degradation.test.ts.
 */
import { describe, it, expect, vi } from 'vitest';
import { skeletonCap } from '../skeleton-provider.js';
import { REDACTED_MARKER } from '../secret-redaction.js';
import { CORPUS_APP, events, fakeLocator, makeProvider, setupSkeletonProviderFixture, spyExtractor, sym, root } from './skeleton-provider-harness.js';

setupSkeletonProviderFixture();

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

// STC UT-35 (DEFECT-QA-01) — F-1 regression guard (SEC-360-01 vector 3/3).
// skeleton-fallback.ts (commit 0d33706) maps REGEX candidates through
// sanitizeCandidate BEFORE extractOutline. Pre-fix, the raw backend signature
// line ("const API_KEY = 'sk-live-...'") flowed straight into the skeleton —
// the assertions below FAIL on pre-fix code, so the test discriminates the bug.
describe('UT-35 — F-1: fallback REGEX rung redacts secrets (SEC-360-01)', () => {
  it('grammar-less file with a secret constant renders [REDACTED], never the secret', async () => {
    const SECRET = 'sk-live-abcdefgh1234567890';
    const locator = fakeLocator(
      CORPUS_APP,
      vi.fn(async (files: Array<{ path: string }>) =>
        files
          .filter((f) => f.path.includes('Component.svelte'))
          .flatMap((f) => [
            // Raw code_extract_signatures output — the regex extractor emits the
            // full source line as the signature, NOT redacted (backend side).
            sym('API_KEY', 'constant', f.path, 2, `const API_KEY = '${SECRET}';`),
            // Non-secret control candidate — must survive rendering intact (F-1b).
            sym('load', 'function', f.path, 3, 'export function load(input: string): string'),
          ])
      )
    );
    const { skeleton } = await makeProvider(locator).getSections(root, 19668, []);
    // Sanitized render: marker in place of the assignment value, zero leak.
    expect(skeleton.skeletonContent).toContain(`constant API_KEY const ${REDACTED_MARKER};`);
    expect(skeleton.skeletonContent).not.toContain(SECRET);
    expect(skeleton.skeletonContent).toContain('function load export function load(input: string): string');
    // Pin the leak vector: the REGEX_SIGNATURES rung for this file (not grammar/
    // RAW_HEAD). The shared events array accumulates across tests in this file,
    // so assert presence rather than an exact count.
    const regexRung = events.filter(
      (e) =>
        e.event === 'PI_SKELETON_FALLBACK' &&
        (e.payload as { filePath?: string }).filePath === 'src/Component.svelte' &&
        (e.payload as { fallbackMode?: string }).fallbackMode === 'REGEX_SIGNATURES'
    );
    expect(regexRung.length).toBeGreaterThan(0);
    // Hygiene never blocks the session (BR-360-03).
    expect(skeleton.gateDecision).not.toBe('REJECT');
  });
});
