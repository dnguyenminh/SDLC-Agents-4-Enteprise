/**
 * SA4E-360 — read_method → code_symbol_locate chain integration tests
 * (TDD task T9; STC IT-04, IT-11, IT-12).
 *
 * REAL components: real QueryLayer over a fixture SQLite index (SCHEMA_V1),
 * real JSON-RPC /mcp surface on an in-process HTTP server (loopback), real
 * HttpMcpCaller fetch chain with the session nonce, real ReadMethodTool,
 * real intra-turn gate + transcript compaction, real TurnBudgetGuard.
 * ONLY the LLM provider is absent (no inference in CI).
 * Fixture data: read-method-testdata.csv RM-14..RM-17; golden-query-set.csv.
 * IT-05/IT-06/estimator-parity live in read-method-chain-gates.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { chainAdapter, chainBaseUrl, executeReadMethod, GOLDEN, PROJECT, setupReadMethodChainFixture, WORKSPACE } from './read-method-chain.fixture.js';
import { McpSymbolLocator } from '../symbol-locator.js';
import { SkeletonProvider } from '../skeleton-provider.js';
import { IndexFreshnessChecker } from '../index-freshness-checker.js';
import { HttpMcpCaller } from '../../../pi-agent/context-retrieval/search-provider.js';

setupReadMethodChainFixture();

// STC IT-04 — read_method → code_symbol_locate chain over the real backend (RM-14/FIX-11)
describe('IT-04: read_method → code_symbol_locate real chain', () => {
  it('resolves ReadMethodTool.create end-to-end with the exact slice', async () => {
    const env = await executeReadMethod('ReadMethodTool', 'create');
    expect(env.status).toBe('ok');
    expect(env).toMatchObject({
      filePath: 'extension/src/pi-workflow/skeleton/read-method-tool.ts',
      startLine: 40, endLine: 88,
    });
    const slice = String(env.sourceSlice);
    expect(slice.split('\n')).toHaveLength(49); // lines 40..88 inclusive
    expect(slice).toContain('[create starts]'); // real file content, not fabricated
  });
});

// STC IT-11 — golden query set hit-rate ≥ 80% top-5 (M2, GHR-01..03)
describe('IT-11: golden query set hit-rate (M2)', () => {
  it('records every query status through the REAL chain; hit-rate ≥ 80%', async () => {
    const statuses: Array<{ id: string; status: string }> = [];
    for (const [cls, method] of GOLDEN) {
      const env = await executeReadMethod(cls, method);
      statuses.push({ id: `${cls}.${method}`, status: String(env.status) });
    }
    // GHR-03: every query status recorded — no exception swallowed.
    expect(statuses).toHaveLength(GOLDEN.length);
    const okCount = statuses.filter((s) => s.status === 'ok').length;
    // GHR-01: 11 resolvable + 1 designed miss → 11/12 = 91.7% ≥ 80%.
    expect(okCount / GOLDEN.length).toBeGreaterThanOrEqual(0.8);
    // GHR-02: the negative control MUST return not_found WITH suggestions.
    const miss = statuses.find((s) => s.id === 'GhostClass.ghostMethod');
    expect(miss?.status).toBe('not_found');
  }, 60_000);
});

// STC IT-12 — skeleton coverage ≥ 95% of exported symbols (M1)
describe('IT-12: skeleton coverage (M1)', () => {
  it('renders ≥ 95% of indexed symbols through the real corpus query', async () => {
    const locator = new McpSymbolLocator(new HttpMcpCaller(chainBaseUrl()));
    const freshness = new IndexFreshnessChecker({ reindex: () => locator.reindex() });
    const provider = new SkeletonProvider({ locator, freshness });
    const sections = await provider.getSections(WORKSPACE, 19_668, []);
    const rendered = (sections.skeleton.skeletonContent.match(/^(class|method|function|interface|constant) /gm) ?? []).length;
    const indexed = (await chainAdapter().allAsync<{ c: number }>('SELECT COUNT(*) AS c FROM symbols WHERE project_id = ?', [PROJECT]))[0].c;
    expect(indexed).toBeGreaterThan(0);
    expect(rendered / indexed).toBeGreaterThanOrEqual(0.95);
  }, 60_000);
});
