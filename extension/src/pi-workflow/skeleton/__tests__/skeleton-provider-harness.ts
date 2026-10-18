/**
 * SA4E-360 — shared harness for the SkeletonProvider tests (TDD task T6):
 * temp workspace fixtures (grammar/regex/rawhead/secret files), fake locator
 * + freshness, spy extractor, provider factory with event capture.
 */
import { beforeAll, afterAll, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SkeletonProvider } from '../skeleton-provider.js';
import { SymbolOutlineExtractor, FsContentReader } from '../../../pi-agent/context-retrieval/symbol-outline-extractor.js';
import { TokenCounter } from '../../../pi-agent/context-retrieval/token-counter.js';
import type { SymbolLocator } from '../symbol-locator.js';
import type { IndexFreshnessChecker } from '../index-freshness-checker.js';
import type { SearchCandidate } from '../../../pi-agent/context-retrieval/types.js';

export let root = '';
export const events: Array<{ event: string; payload: unknown }> = [];

export function sym(name: string, kind: string, filePath: string, startLine: number, signature?: string): SearchCandidate {
  return { name, kind, filePath, startLine, signature, source: 'code_search' };
}

export const CORPUS_APP = [
  sym('App', 'class', 'src/app.ts', 1, 'class App {'),
  sym('render', 'method', 'src/app.ts', 10, 'render(target: string): void'),
];

export function fakeLocator(corpus: SearchCandidate[], extract?: (files: Array<{ path: string }>) => Promise<SearchCandidate[]>): SymbolLocator {
  return {
    locate: vi.fn(async () => ({ rows: [] })),
    extractSignatures: vi.fn(extract ?? (async () => [])),
    fetchSymbolCorpus: vi.fn(async () => corpus),
    reindex: vi.fn(async () => true),
  };
}

export function fakeFreshness(): IndexFreshnessChecker {
  return {
    checkFile: vi.fn(async () => 'FRESH'),
    sweep: vi.fn(async () => ({ status: 'FRESH', action: 'none', staleFiles: [], files: new Map() })),
  } as unknown as IndexFreshnessChecker;
}

/** Spy extractor delegating to a real SymbolOutlineExtractor (counts + captures). */
export function spyExtractor() {
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

export function makeProvider(locator: SymbolLocator, extractor?: SymbolOutlineExtractor): SkeletonProvider {
  return new SkeletonProvider({ locator, freshness: fakeFreshness(), extractor, emit: (event, payload) => events.push({ event, payload }) });
}

/** Registers the temp-workspace fixtures (call once per test file). */
export function setupSkeletonProviderFixture(): void {
  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sa4e-360-provider-'));
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'app.ts'), 'export class App {}\n');
    fs.writeFileSync(path.join(root, 'src', 'Widget.svelte'), '<script>\n  export function load(x) { return x; }\n</script>\n');
    // UT-35 fixture — grammar-less file holding a credential literal; the REGEX
    // rung must redact it BEFORE the outline render (F-1, commit 0d33706).
    fs.writeFileSync(
      path.join(root, 'src', 'Component.svelte'),
      '<script lang="ts">\nconst API_KEY = \'sk-live-abcdefgh1234567890\';\nexport function load(input: string): string {\n  return input;\n}\n</script>\n'
    );
    fs.writeFileSync(path.join(root, 'src', 'Template.hbs'), '<div>{{title}}</div>\n');
    fs.mkdirSync(path.join(root, 'empty-ws'), { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });
}
