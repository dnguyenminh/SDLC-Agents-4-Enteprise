/**
 * SA4E-360 — read_method tool tests (TDD task T4; STC UT-17..25).
 * C-360-R1/R2 envelopes, EF-4 bounds check, SEC-325-D1 containment,
 * SEC-360-06 MAX_SLICE cap. Fixture data: read-method-testdata.csv RM-01..RM-13.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createReadMethodTool, MAX_SLICE_LINES } from '../read-method-tool.js';
import type { IndexFreshnessChecker } from '../index-freshness-checker.js';
import type { SymbolLocator } from '../symbol-locator.js';
import type { LocateRow, LocateResponse } from '../skeleton-types.js';

let root = '';
const FIXTURE_REL = 'extension/src/pi-agent/context-retrieval/symbol-outline-extractor.ts';
/** 60 numbered lines; slice 35..48 = 14 lines (RM-04). */
const FIXTURE_LINES = Array.from({ length: 60 }, (_, i) => `// line ${i + 1}`);

function row(overrides: Partial<LocateRow> = {}): LocateRow {
  return {
    name: 'extractOutline', kind: 'method', signature: 'extractOutline(filePath, symbols, maxTokens)',
    filePath: FIXTURE_REL, startLine: 35, endLine: 48, lineCount: 60, parentSymbol: 'SymbolOutlineExtractor',
    ...overrides,
  };
}

function stubLocator(rows: LocateRow[], classMethods?: string[], impl?: SymbolLocator): SymbolLocator {
  const base: SymbolLocator = {
    locate: vi.fn(async (): Promise<LocateResponse> => ({ rows, classMethods })),
    extractSignatures: vi.fn(async () => []),
    fetchSymbolCorpus: vi.fn(async () => []),
    reindex: vi.fn(async () => true),
  };
  return { ...base, ...impl };
}

function stubFreshness(impl: Partial<IndexFreshnessChecker> = {}): IndexFreshnessChecker {
  return {
    checkFile: vi.fn(async () => 'FRESH'),
    sweep: vi.fn(async () => ({ status: 'FRESH', action: 'none', staleFiles: [], files: new Map() })),
    ...impl,
  } as unknown as IndexFreshnessChecker;
}

function makeTool(locator: SymbolLocator, freshness = stubFreshness()) {
  return createReadMethodTool(root, locator, freshness);
}

async function execute(tool: AgentToolLike, params: unknown) {
  const result = await tool.execute('call-1', params);
  const text = (result.content as Array<{ type: string; text: string }>)[0].text;
  return { envelope: JSON.parse(text) as Record<string, unknown>, details: result.details as Record<string, unknown>, text };
}

interface AgentToolLike {
  execute: (id: string, params: unknown) => Promise<{ content: Array<{ text: string }>; details: unknown }>;
}

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'sa4e-360-readmethod-'));
  const abs = path.join(root, FIXTURE_REL.replaceAll('/', path.sep));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, FIXTURE_LINES.join('\n'));
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

// STC UT-17 — INVALID_ARGS envelope; execute() never throws
describe('UT-17 — INVALID_ARGS validation', () => {
  it.each([
    ['empty class', { class: '', method: 'm' }],
    ['whitespace method', { class: 'C', method: '   ' }],
    ['missing method', { class: 'C' }],
    ['non-string class', { class: 42, method: 'm' }],
  ])('%s → INVALID_ARGS envelope, no throw', async (_name, params) => {
    const { envelope, details } = await execute(makeTool(stubLocator([])) as AgentToolLike, params);
    expect(envelope.status).toBe('error');
    expect(envelope.code).toBe('INVALID_ARGS');
    expect(String(envelope.message)).toMatch(/non-empty/i);
    expect(String(envelope.usageHint)).toMatch(/read_method/);
    expect(details).toEqual(envelope); // C-360-R2: details = parsed envelope
  });
});

// STC UT-18 — ok envelope, exact slice, contract shape
describe('UT-18 — ok envelope with exact slice', () => {
  it('returns source lines 35..48 byte-equal + details parity', async () => {
    const locator = stubLocator([row()]);
    const { envelope } = await execute(makeTool(locator) as AgentToolLike, { class: 'SymbolOutlineExtractor', method: 'extractOutline' });
    expect(envelope.status).toBe('ok');
    expect(envelope.filePath).toBe(FIXTURE_REL);
    expect(envelope.symbolKind).toBe('method');
    expect(envelope.name).toBe('extractOutline');
    expect(envelope.startLine).toBe(35);
    expect(envelope.endLine).toBe(48);
    expect(envelope.sourceSlice).toBe(FIXTURE_LINES.slice(34, 48).join('\n'));
    expect(locator.locate).toHaveBeenCalledWith('SymbolOutlineExtractor', 'extractOutline');
  });
});

// STC UT-19 — AMBIGUOUS: candidates only, NO arbitrary pick (AF-1)
describe('UT-19 — ambiguous envelope', () => {
  it('overloads in different files → 2 candidates, no slice/filePath choice', async () => {
    const rows = [
      row({ name: 'parse', filePath: 'a/parser.ts', startLine: 12, parentSymbol: 'Parser' }),
      row({ name: 'parse', filePath: 'b/parser.ts', startLine: 30, kind: 'function', parentSymbol: null }),
    ];
    const { envelope } = await execute(makeTool(stubLocator(rows)) as AgentToolLike, { class: 'Parser', method: 'parse' });
    expect(envelope.status).toBe('ambiguous');
    expect(envelope.candidates).toHaveLength(2);
    expect(envelope.candidates[0]).toMatchObject({ name: 'parse', kind: 'method', filePath: 'a/parser.ts', startLine: 12 });
    expect(envelope).not.toHaveProperty('sourceSlice');
    expect(envelope).not.toHaveProperty('filePath');
  });

  it('same-class overloads with differing kinds stay ambiguous (RM-06)', async () => {
    const rows = [
      row({ name: 'calculate', kind: 'method', startLine: 10 }),
      row({ name: 'calculate', kind: 'function', startLine: 500 }),
    ];
    const { envelope } = await execute(makeTool(stubLocator(rows)) as AgentToolLike, { class: 'BudgetCalculator', method: 'calculate' });
    expect(envelope.status).toBe('ambiguous');
  });
});

// STC UT-20 — not_found + AF-4 classMethods enrichment
describe('UT-20 — not_found envelope', () => {
  it('class matched, method missing → suggestions + classMethods (top 10)', async () => {
    const methods = Array.from({ length: 10 }, (_, i) => `method${i}`);
    const { envelope } = await execute(makeTool(stubLocator([], methods)) as AgentToolLike, { class: 'SymbolOutlineExtractor', method: 'nonexistentMethod' });
    expect(envelope.status).toBe('not_found');
    expect(envelope.suggestions).toEqual(['get_workspace_info', 'find_tools', 'code_search']);
    expect(envelope.classMethods).toEqual(methods);
  });

  it('class absent entirely → not_found WITHOUT classMethods (RM-08)', async () => {
    const { envelope } = await execute(makeTool(stubLocator([], [])) as AgentToolLike, { class: 'NonexistentClass', method: 'foo' });
    expect(envelope.status).toBe('not_found');
    expect(envelope).not.toHaveProperty('classMethods');
  });
});

// STC UT-21 — corrupt bounds → INDEX_STALE freshness path, never a wrong slice (EF-4)
describe('UT-21 — corrupt bounds route to freshness recovery', () => {
  it('endLine < startLine → checkFile + ONE re-locate → ok', async () => {
    const freshness = stubFreshness();
    let call = 0;
    const locator = stubLocator([], undefined, {
      locate: vi.fn(async () => ({ rows: [call++ === 0 ? row({ startLine: 20, endLine: 10 }) : row()] })),
    });
    const { envelope } = await execute(makeTool(locator, freshness) as AgentToolLike, { class: 'C', method: 'm' });
    expect(freshness.checkFile).toHaveBeenCalledWith(root, FIXTURE_REL);
    expect(locator.locate).toHaveBeenCalledTimes(2); // original + ONE retry (AF-2)
    expect(envelope.status).toBe('ok');
  });

  it('endLine > lineCount → recovery; retry still corrupt → not_found guidance', async () => {
    const freshness = stubFreshness();
    const locator = stubLocator([], undefined, {
      locate: vi.fn(async () => ({ rows: [row({ endLine: 500, lineCount: 60 })] })),
    });
    const { envelope } = await execute(makeTool(locator, freshness) as AgentToolLike, { class: 'C', method: 'm' });
    expect(envelope.status).toBe('not_found');
    expect(envelope.suggestions).toContain('get_workspace_info');
  });
});

// TA Finding B regression (SA4E-360 review) — TDD §10-7 / FSD AF-2: the stale
// retry must RE-INDEX changed rows BEFORE the re-locate; a bare re-locate
// against an unchanged index is a no-op self-heal (re-queries unchanged rows).
describe('TA Finding B: stale recovery reindexes before the retry (AF-2)', () => {
  it('checkFile STALE → reindex exactly ONCE → ONE re-locate resolves the healthy row', async () => {
    const freshness = stubFreshness({ checkFile: vi.fn(async () => 'STALE') });
    let call = 0;
    const locator = stubLocator([], undefined, {
      locate: vi.fn(async () => ({ rows: [call++ === 0 ? row({ startLine: 20, endLine: 10 }) : row()] })),
      reindex: vi.fn(async () => true),
    });
    const { envelope } = await execute(makeTool(locator, freshness) as AgentToolLike, { class: 'C', method: 'm' });
    expect(freshness.checkFile).toHaveBeenCalledWith(root, FIXTURE_REL);
    expect(locator.reindex).toHaveBeenCalledTimes(1); // re-index BEFORE the retry locate
    expect(locator.locate).toHaveBeenCalledTimes(2); // original + ONE retry (AF-2)
    expect(envelope.status).toBe('ok');
  });

  it('reindex failure is fail-safe: the single re-locate still runs → not_found steering, no throw', async () => {
    const freshness = stubFreshness({ checkFile: vi.fn(async () => 'STALE') });
    const locator = stubLocator([], undefined, {
      locate: vi.fn(async () => ({ rows: [row({ endLine: 500, lineCount: 60 })] })), // stays corrupt
      reindex: vi.fn(async () => { throw new Error('code_index_status failed'); }),
    });
    const { envelope } = await execute(makeTool(locator, freshness) as AgentToolLike, { class: 'C', method: 'm' });
    expect(locator.reindex).toHaveBeenCalledTimes(1);
    expect(locator.locate).toHaveBeenCalledTimes(2); // retry still attempted (fail-safe)
    expect(envelope.status).toBe('not_found');
    expect(envelope.suggestions).toContain('get_workspace_info'); // steering preserved
  });

  it('checkFile FRESH → NO reindex (only the stale branch triggers the delegate)', async () => {
    const freshness = stubFreshness(); // checkFile → 'FRESH'
    const locator = stubLocator([], undefined, {
      locate: vi.fn(async () => ({ rows: [row({ endLine: 500, lineCount: 60 })] })),
      reindex: vi.fn(async () => true),
    });
    await execute(makeTool(locator, freshness) as AgentToolLike, { class: 'C', method: 'm' });
    expect(locator.reindex).not.toHaveBeenCalled();
  });
});

// STC UT-22 — FILE_UNREADABLE: actionable error inside the result (EF-2)
describe('UT-22 — FILE_UNREADABLE envelope', () => {
  it('unreadable file → error envelope with actionable text, no throw', async () => {
    const freshness = stubFreshness();
    const locator = stubLocator([row({ filePath: 'missing/dir/File.ts' })]);
    const { envelope } = await execute(makeTool(locator, freshness) as AgentToolLike, { class: 'C', method: 'm' });
    expect(envelope.status).toBe('error');
    expect(envelope.code).toBe('FILE_UNREADABLE');
    expect(String(envelope.message)).toContain('Cannot read');
  });
});

// STC UT-23 — INDEX_UNAVAILABLE steering envelope (EF-3) + retry semantics
describe('UT-23 — INDEX_UNAVAILABLE envelope', () => {
  it('locator rejection → INDEX_UNAVAILABLE steering to get_workspace_info, no throw', async () => {
    const freshness = stubFreshness();
    const locator = stubLocator([], undefined, {
      locate: vi.fn(async () => { throw new Error('Search tool code_symbol_locate timed out after 2000ms'); }),
    });
    const { envelope } = await execute(makeTool(locator, freshness) as AgentToolLike, { class: 'C', method: 'm' });
    expect(envelope.status).toBe('error');
    expect(envelope.code).toBe('INDEX_UNAVAILABLE');
    expect(String(envelope.message)).toContain('get_workspace_info');
    expect(locator.locate).toHaveBeenCalledTimes(1); // tool adds NO retry — the locator adapter owns 2 attempts
  });

  it('McpSymbolLocator retries ONCE (2 attempts total, 200ms backoff)', async () => {
    const { McpSymbolLocator } = await import('../symbol-locator.js');
    const attempts = vi.fn(async () => { throw new Error('boom'); });
    const locator = new McpSymbolLocator({ callMcpWrapper: attempts } as never, { retryBackoffMs: 1 });
    await expect(locator.locate('C', 'm')).rejects.toThrow('boom');
    expect(attempts).toHaveBeenCalledTimes(2); // 1 original + 1 retry (TDD §7.4)
  });
});

// STC UT-24 — extension-side containment (SEC-325-D1): reject BEFORE any read
describe('UT-24 — path containment on index-derived paths', () => {
  it('absolute path outside root → FILE_UNREADABLE, zero bytes read', async () => {
    // Computed OUTSIDE-ABSOLUTE fixture (platform-agnostic): a hard-coded
    // `C:\...` string is a legal RELATIVE filename on posix and would pass
    // containment there. path.resolve(root, '..') is absolute-outside on
    // every platform — the exact property under test.
    const outsideAbs = path.resolve(root, '..', 'secrets', 'impl.ts');
    const locator = stubLocator([row({ filePath: outsideAbs })]);
    const { envelope } = await execute(makeTool(locator) as AgentToolLike, { class: 'C', method: 'm' });
    expect(envelope.status).toBe('error');
    expect(envelope.code).toBe('FILE_UNREADABLE');
    expect(String(envelope.message)).toContain('outside the workspace root');
  });

  it('dotdot traversal → rejected; control contained path still resolves', async () => {
    const traversal = stubLocator([row({ filePath: '../outside/impl.ts' })]);
    const a = await execute(makeTool(traversal) as AgentToolLike, { class: 'C', method: 'm' });
    expect(a.envelope.code).toBe('FILE_UNREADABLE');
    const ok = await execute(makeTool(stubLocator([row()])) as AgentToolLike, { class: 'C', method: 'm' });
    expect(ok.envelope.status).toBe('ok'); // no false positive
  });
});

// STC UT-25 — MAX_SLICE cap (SEC-360-06)
describe('UT-25 — MAX_SLICE cap on oversized symbol', () => {
  it('5000-line symbol → ok, sliceTruncated, totalLines 5000, ≤ 2000 lines read', async () => {
    const abs = path.join(root, 'huge', 'Big.ts');
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, Array.from({ length: 5000 }, (_, i) => `line ${i + 1}`).join('\n'));
    const locator = stubLocator([row({ name: 'renderAll', filePath: 'huge/Big.ts', startLine: 1, endLine: 5000, lineCount: 5000 })]);
    const { envelope } = await execute(makeTool(locator) as AgentToolLike, { class: 'Big', method: 'renderAll' });
    expect(envelope.status).toBe('ok');
    expect(envelope.sliceTruncated).toBe(true);
    expect(envelope.totalLines).toBe(5000);
    const slice = String(envelope.sourceSlice).split('\n');
    expect(slice.length).toBeLessThanOrEqual(MAX_SLICE_LINES);
    expect(slice[0]).toBe('line 1');
    expect(slice[slice.length - 1]).toBe(`line ${slice.length}`); // read stopped exactly at the cap
  });
});
