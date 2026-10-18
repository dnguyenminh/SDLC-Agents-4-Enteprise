/**
 * SA4E-360 — read_method tool: stale recovery + availability + containment
 * + MAX_SLICE cap (TDD task T4; TA Finding B regression, STC UT-23..25).
 * UT-17..UT-22 live in read-method-tool.test.ts.
 * Fixture data: read-method-testdata.csv RM-09..RM-13.
 */
import { describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { MAX_SLICE_LINES } from '../read-method-tool.js';
import { FIXTURE_REL, row, stubLocator, stubFreshness, makeTool, execute, AgentToolLike, setupReadMethodToolFixture, root } from './read-method-tool-harness.js';

setupReadMethodToolFixture();

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
