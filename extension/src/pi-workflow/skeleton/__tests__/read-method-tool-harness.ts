/**
 * SA4E-360 — shared harness for the read_method tool tests (TDD task T4):
 * temp fixture file (60 numbered lines), row/stub builders, execute helper.
 * Fixture data: read-method-testdata.csv RM-01..RM-13.
 */
import { beforeAll, afterAll, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createReadMethodTool } from '../read-method-tool.js';
import type { IndexFreshnessChecker } from '../index-freshness-checker.js';
import type { SymbolLocator } from '../symbol-locator.js';
import type { LocateRow, LocateResponse } from '../skeleton-types.js';

export let root = '';
export const FIXTURE_REL = 'extension/src/pi-agent/context-retrieval/symbol-outline-extractor.ts';
/** 60 numbered lines; slice 35..48 = 14 lines (RM-04). */
export const FIXTURE_LINES = Array.from({ length: 60 }, (_, i) => `// line ${i + 1}`);

export function row(overrides: Partial<LocateRow> = {}): LocateRow {
  return {
    name: 'extractOutline', kind: 'method', signature: 'extractOutline(filePath, symbols, maxTokens)',
    filePath: FIXTURE_REL, startLine: 35, endLine: 48, lineCount: 60, parentSymbol: 'SymbolOutlineExtractor',
    ...overrides,
  };
}

export function stubLocator(rows: LocateRow[], classMethods?: string[], impl?: SymbolLocator): SymbolLocator {
  const base: SymbolLocator = {
    locate: vi.fn(async (): Promise<LocateResponse> => ({ rows, classMethods })),
    extractSignatures: vi.fn(async () => []),
    fetchSymbolCorpus: vi.fn(async () => []),
    reindex: vi.fn(async () => true),
  };
  return { ...base, ...impl };
}

export function stubFreshness(impl: Partial<IndexFreshnessChecker> = {}): IndexFreshnessChecker {
  return {
    checkFile: vi.fn(async () => 'FRESH'),
    sweep: vi.fn(async () => ({ status: 'FRESH', action: 'none', staleFiles: [], files: new Map() })),
    ...impl,
  } as unknown as IndexFreshnessChecker;
}

export function makeTool(locator: SymbolLocator, freshness = stubFreshness()) {
  return createReadMethodTool(root, locator, freshness);
}

export async function execute(tool: AgentToolLike, params: unknown) {
  const result = await tool.execute('call-1', params);
  const text = (result.content as Array<{ type: string; text: string }>)[0].text;
  return { envelope: JSON.parse(text) as Record<string, unknown>, details: result.details as Record<string, unknown>, text };
}

export interface AgentToolLike {
  execute: (id: string, params: unknown) => Promise<{ content: Array<{ text: string }>; details: unknown }>;
}

/** Registers the temp fixture file (call once per test file). */
export function setupReadMethodToolFixture(): void {
  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sa4e-360-readmethod-'));
    const abs = path.join(root, FIXTURE_REL.replaceAll('/', path.sep));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, FIXTURE_LINES.join('\n'));
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });
}
