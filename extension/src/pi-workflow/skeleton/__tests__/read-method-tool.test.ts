/**
 * SA4E-360 — read_method tool tests (TDD task T4; STC UT-17..22).
 * C-360-R1/R2 envelopes, EF-4 bounds check, SEC-325-D1 containment.
 * Stale-recovery/TA-Finding-B + UT-23/24/25 live in
 * read-method-tool-recovery.test.ts. Fixture data: read-method-testdata.csv.
 */
import { describe, it, expect, vi } from 'vitest';
import { FIXTURE_REL, FIXTURE_LINES, row, stubLocator, stubFreshness, makeTool, execute, AgentToolLike, setupReadMethodToolFixture, root } from './read-method-tool-harness.js';

setupReadMethodToolFixture();

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
