/**
 * SA4E-360 — QueryLayer.locateSymbol unit tests (TDD task T3; STC T3 test list).
 * Covers: exact match, enclosing-type scoping (parent_symbol + same-file
 * fallback), overloads → multi-row, classMethods enrichment, tenant isolation
 * (fail-closed scope), engine-agnostic adapter use, and the SEC-360-05
 * sanitizeLikeQuery application to findSymbols/listModulesWithPatterns.
 */
import { describe, it, expect, vi } from 'vitest';
import { QueryLayer } from '../../query/query-layer.js';

/** Captures the SQL + params the adapter receives for a call. */
function capture() {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  let response: unknown[] = [];
  const allAsync = vi.fn(async (sql: string, params: unknown[]) => {
    calls.push({ sql, params });
    return response;
  });
  const adapter = {
    getEngine: () => 'sqlite',
    allAsync,
    getAsync: vi.fn(async () => ({ c: 0 })),
  };
  return {
    adapter: adapter as never,
    calls,
    allAsync,
    /** Sets the rows the adapter returns WITHOUT replacing the capture impl. */
    respond: (rows: unknown[]) => {
      response = rows;
    },
  };
}

const ROW = {
  name: 'create', kind: 'method', signature: 'create(root, locator)',
  filePath: 'extension/src/pi-workflow/skeleton/read-method-tool.ts',
  startLine: 40, endLine: 88, lineCount: 120, parentSymbol: 'ReadMethodTool',
};

describe('QueryLayer.locateSymbol (SA4E-360 T3)', () => {
  it('resolves an exact method within its enclosing class (parent_symbol path)', async () => {
    const { adapter, calls, respond } = capture();
    respond([ROW]);
    const ql = new QueryLayer(adapter);
    const rows = await ql.locateSymbol('p1', 'ReadMethodTool', 'create', 25);
    expect(rows).toEqual([ROW]);
    const { sql, params } = calls[0];
    // Equality (not LIKE) — no wildcard vector on the new tool.
    expect(sql).toContain('s.name = ?');
    expect(sql).toContain("s.kind IN ('method','function')");
    expect(sql).toContain('f.line_count AS lineCount');
    // Parent-symbol OR same-file-membership fallback scoping.
    expect(sql).toContain('s.parent_symbol = ?');
    expect(sql).toContain("kind IN ('class','interface','struct','trait')");
    // Tenant scope fail-closed + bounded.
    expect(sql).toContain('s.project_id = ?');
    expect(sql).toContain('LIMIT ?');
    expect(params).toContain('create');
    expect(params).toContain('ReadMethodTool');
  });

  it('scopes the enclosing-type subquery to the same tenant (no cross-tenant leak)', async () => {
    const { adapter, calls } = capture();
    const ql = new QueryLayer(adapter);
    await ql.locateSymbol('projA', 'Parser', 'parse', 25);
    const { sql } = calls[0];
    expect(sql).toMatch(/SELECT id FROM symbols/i);
    expect(sql).toContain('project_id = ?');
  });

  it('returns zero rows for an absent tenant scope (fail-closed)', async () => {
    const { adapter, calls } = capture();
    const ql = new QueryLayer(adapter);
    const rows = await ql.locateSymbol(undefined, 'Parser', 'parse', 25);
    expect(rows).toEqual([]);
    expect(calls[0].sql).toContain('1=0');
  });

  it('clamps the limit into the adapter bound (never unbounded)', async () => {
    const { adapter, calls } = capture();
    const ql = new QueryLayer(adapter);
    await ql.locateSymbol('p1', 'C', 'm', 10_000);
    expect(calls[0].params[calls[0].params.length - 1]).toBe(100);
  });

  it('lists class methods for the AF-4 enrichment, bounded to 10', async () => {
    const { adapter, calls, respond } = capture();
    respond([{ name: 'create' }, { name: 'truncate' }]);
    const ql = new QueryLayer(adapter);
    const names = await ql.listClassMethods('p1', 'SymbolOutlineExtractor', 10);
    expect(names).toEqual(['create', 'truncate']);
    expect(calls[0].sql).toContain("s.kind IN ('method','function')");
    expect(calls[0].sql).toContain('DISTINCT');
  });

  it('uses the adapter (engine-agnostic — same SQL path for PostgreSQL)', async () => {
    const { adapter, calls } = capture();
    const ql = new QueryLayer(adapter);
    await ql.locateSymbol('p1', 'C', 'm', 5);
    expect(calls).toHaveLength(1); // no FTS5-specific SQL in the results path
    expect(calls[0].sql).not.toMatch(/symbols_fts|MATCH/i);
  });
});

// STC E2E-API-11 precondition — SEC-360-05 remediation at QueryLayer level
describe('SEC-360-05 — sanitizeLikeQuery applied to LIKE paths', () => {
  it('escapes LIKE wildcards in findSymbols (name=% stays literal)', async () => {
    const { adapter, calls } = capture();
    const ql = new QueryLayer(adapter);
    await ql.findSymbols('p1', '%');
    const { params } = calls[0];
    expect(params[0]).toBe('\\%%'); // literal % — no full-table enumeration
  });

  it('escapes LIKE wildcards in listModulesWithPatterns', async () => {
    const { adapter, calls } = capture();
    const ql = new QueryLayer(adapter);
    await ql.listModulesWithPatterns('p1', 'al%pha');
    const { params, sql } = calls[0];
    expect(sql).toContain("ESCAPE '\\'");
    expect(params[params.length - 1]).toBe('al\\%pha%');
  });

  it('preserves clean prefix behavior for legitimate names', async () => {
    const { adapter, calls } = capture();
    const ql = new QueryLayer(adapter);
    await ql.findSymbols('p1', 'alpha_method');
    // The underscore is escaped and the LIKE carries ESCAPE '\\' — the pattern
    // still matches the literal name prefix (E2E-API-11 step 2).
    expect(calls[0].params[0]).toBe('alpha\\_method%');
    expect(calls[0].sql).toContain("ESCAPE '\\'");
  });
});
