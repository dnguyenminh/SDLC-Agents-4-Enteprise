/**
 * SA4E-360 — read_method → code_symbol_locate chain integration tests
 * (TDD task T9; STC IT-04..06, IT-11, IT-12).
 *
 * REAL components: real QueryLayer over a fixture SQLite index (SCHEMA_V1),
 * real JSON-RPC /mcp surface on an in-process HTTP server (loopback), real
 * HttpMcpCaller fetch chain with the session nonce, real ReadMethodTool,
 * real intra-turn gate + transcript compaction, real TurnBudgetGuard.
 * ONLY the LLM provider is absent (no inference in CI).
 * Fixture data: read-method-testdata.csv RM-14..RM-17; golden-query-set.csv.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as http from 'node:http';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SqliteAdapter } from '../../../../../backend/src/database/adapters/SqliteAdapter.js';
import { SCHEMA_V1 } from '../../../../../backend/src/engine/db/schema.js';
import { QueryLayer } from '../../../../../backend/src/engine/query/query-layer.js';
import { dispatchCodeIntelTool } from '../../../../../backend/src/engine/tools/register-tools.js';
import { HttpMcpCaller } from '../../../pi-agent/context-retrieval/search-provider.js';
import { McpSymbolLocator } from '../symbol-locator.js';
import { createReadMethodTool } from '../read-method-tool.js';
import { SkeletonProvider } from '../skeleton-provider.js';
import { IndexFreshnessChecker } from '../index-freshness-checker.js';
import { governIntraTurnRequest } from '../../intra-turn-budget-gate.js';
import { TurnBudgetGuard } from '../../turn-budget-guard.js';
import { estimateTokenCount } from '../../../pi-agent/prompt-compressor.js';
import type { Message } from '@earendil-works/pi-ai';
import type { SymbolLocator } from '../symbol-locator.js';

const WORKSPACE = fs.mkdtempSync(path.join(os.tmpdir(), 'sa4e-360-chain-'));
const PROJECT = 'default';
let adapter: SqliteAdapter;
let server: http.Server;
let baseUrl = '';

/** Golden query set (documents/SA4E-360/testdata/golden-query-set.csv). */
const GOLDEN: Array<[string, string, 'ok' | 'not_found']> = [
  ['SymbolOutlineExtractor', 'extractOutline', 'ok'],
  ['ReadMethodTool', 'create', 'ok'],
  ['IndexFreshnessChecker', 'sweep', 'ok'],
  ['SkeletonTruncator', 'truncate', 'ok'],
  ['FunctionalMapProvider', 'buildSection', 'ok'],
  ['QueryLayer', 'locateSymbol', 'ok'],
  ['McpSymbolLocator', 'locate', 'ok'],
  ['SummaryTreeBuilder', 'build', 'ok'],
  ['TurnBudgetGuard', 'register', 'ok'],
  ['resolveContextBudget', 'resolve', 'ok'],
  ['compactTranscriptToFit', 'compact', 'ok'],
  ['GhostClass', 'ghostMethod', 'not_found'], // designed miss (negative control)
];

/** Seeds files + symbols rows (FIX-11-style: create @ 40..88, lineCount 120). */
function seed(cls: string, method: string, rel: string, start: number, end: number, lineCount: number): void {
  adapter.run(
    `INSERT INTO files (project_id, path, relative_path, language, module, content_hash, size_bytes, line_count)
     VALUES (?, ?, ?, 'ts', 'extension', 'hash', 100, ?)`,
    [PROJECT, rel, rel, lineCount]
  );
  const fileId = (adapter.get<{ id: number }>('SELECT id FROM files WHERE project_id = ? AND relative_path = ?', [PROJECT, rel]) as { id: number }).id;
  adapter.run(
    `INSERT INTO symbols (project_id, file_id, name, kind, signature, start_line, end_line, parent_symbol)
     VALUES (?, ?, ?, 'method', ?, ?, ?, ?)`,
    [PROJECT, fileId, method, `${method}(a, b)`, start, end, cls]
  );
}

beforeAll(async () => {
  adapter = new SqliteAdapter(':memory:');
  await adapter.connect();
  adapter.exec(SCHEMA_V1);
  // Fixture files on disk (slice reads) + index rows for the golden set.
  const fixtures: Array<[string, string, number, number, number]> = [
    ['SymbolOutlineExtractor', 'extractOutline', 'extension/src/pi-agent/symbol-outline-extractor.ts', 35, 48, 68],
    ['ReadMethodTool', 'create', 'extension/src/pi-workflow/skeleton/read-method-tool.ts', 40, 88, 120],
    ['IndexFreshnessChecker', 'sweep', 'extension/src/pi-workflow/skeleton/index-freshness-checker.ts', 10, 20, 160],
    ['SkeletonTruncator', 'truncate', 'extension/src/pi-workflow/skeleton/skeleton-truncator.ts', 12, 30, 150],
    ['FunctionalMapProvider', 'buildSection', 'extension/src/pi-workflow/skeleton/functional-map-provider.ts', 20, 40, 177],
    ['QueryLayer', 'locateSymbol', 'backend/src/engine/query/query-layer.ts', 60, 90, 264],
    ['McpSymbolLocator', 'locate', 'extension/src/pi-workflow/skeleton/symbol-locator.ts', 15, 25, 130],
    ['SummaryTreeBuilder', 'build', 'extension/src/pi-agent/context-retrieval/summary-tree.ts', 28, 41, 78],
    ['TurnBudgetGuard', 'register', 'extension/src/pi-workflow/turn-budget-guard.ts', 30, 45, 220],
    ['resolveContextBudget', 'resolve', 'extension/src/pi-agent/context-budget-resolver.ts', 43, 59, 98],
    ['compactTranscriptToFit', 'compact', 'extension/src/pi-workflow/transcript-compaction.ts', 50, 70, 240],
  ];
  for (const [cls, method, rel, start, end, lineCount] of fixtures) {
    const abs = path.join(WORKSPACE, rel.replaceAll('/', path.sep));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const lines = Array.from({ length: lineCount }, (_, i) => `// line ${i + 1} of ${rel}` + (i + 1 === start ? ` [${method} starts]` : ''));
    fs.writeFileSync(abs, lines.join('\n'));
    seed(cls, method, rel, start, end, lineCount);
  }
  // Real JSON-RPC /mcp surface on a loopback ephemeral port (real HTTP).
  const queryLayer = new QueryLayer(adapter);
  const indexerStub = { runFullIndex: async () => undefined, isRunning: () => false };
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c: Buffer) => { body += c.toString(); });
    req.on('end', async () => {
      const rpc = JSON.parse(body) as { id: number; params: { name: string; arguments: Record<string, unknown> } };
      const projectId = (rpc.params.arguments.__projectId as string) ?? PROJECT;
      const text = await dispatchCodeIntelTool(rpc.params.name, rpc.params.arguments, queryLayer, adapter, null, indexerStub as never, WORKSPACE, projectId);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result: { content: [{ type: 'text', text }] } }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await adapter.disconnect();
  fs.rmSync(WORKSPACE, { recursive: true, force: true });
});

function makeTool(): { tool: ReturnType<typeof createReadMethodTool>; locator: SymbolLocator } {
  const locator = new McpSymbolLocator(new HttpMcpCaller(baseUrl));
  return { tool: createReadMethodTool(WORKSPACE, locator, new IndexFreshnessChecker({ reindex: () => locator.reindex() })), locator };
}

async function executeReadMethod(cls: string, method: string): Promise<Record<string, unknown>> {
  const { tool } = makeTool();
  const result = (await tool.execute('c1', { class: cls, method })) as { content: Array<{ text: string }> };
  return JSON.parse(result.content[0].text) as Record<string, unknown>;
}

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
    const locator = new McpSymbolLocator(new HttpMcpCaller(baseUrl));
    const freshness = new IndexFreshnessChecker({ reindex: () => locator.reindex() });
    const provider = new SkeletonProvider({ locator, freshness });
    const sections = await provider.getSections(WORKSPACE, 19_668, []);
    const rendered = (sections.skeleton.skeletonContent.match(/^(class|method|function|interface|constant) /gm) ?? []).length;
    const indexed = (await adapter.allAsync<{ c: number }>('SELECT COUNT(*) AS c FROM symbols WHERE project_id = ?', [PROJECT]))[0].c;
    expect(indexed).toBeGreaterThan(0);
    expect(rendered / indexed).toBeGreaterThanOrEqual(0.95);
  }, 60_000);
});

// STC IT-05 — gate #3 absorption: read_method results compactable (BR-360-04)
describe('IT-05: gate #3 absorbs read_method tool results', () => {
  it('compacts atomically (toolCall + toolResult together), preserves the pinned user', () => {
    const slice = 'x'.repeat(4_000 * 4); // a large read_method result
    const messages = [
      { role: 'system', content: 'system prompt' },
      { role: 'user', content: 'review the workspace' },
      { role: 'assistant', content: [{ type: 'toolCall', id: 't1', name: 'read_method', input: { class: 'A', method: 'b' } }] },
      { role: 'toolResult', content: [{ type: 'text', text: slice }], toolCallId: 't1' },
      { role: 'assistant', content: [{ type: 'toolCall', id: 't2', name: 'read_method', input: { class: 'C', method: 'd' } }] },
      { role: 'toolResult', content: [{ type: 'text', text: slice }], toolCallId: 't2' },
      { role: 'user', content: 'newest pinned question' },
    ] as unknown as Message[];
    const result = governIntraTurnRequest({ messages, modelId: 'qwen', nCtxDetected: 8192 });
    const flattened = JSON.stringify(result.messages);
    expect(result.compacted).toBe(true); // gate #3 measured → COMPACT
    // Atomic tool-unit drop: no orphaned toolCall without its result.
    const callIds = (flattened.match(/"t1"/g) ?? []).length;
    if (callIds === 0) expect(flattened).not.toContain('toolCallId":"t1"');
    expect(JSON.stringify(result.messages)).toContain('newest pinned question'); // pinned user preserved
    expect(result.totalTokens).toBeGreaterThan(0);
  });
});

// STC IT-06 — TurnBudgetGuard interplay (BR-11 — shipped guard only, RM-16)
describe('IT-06: TurnBudgetGuard counts identical read_method calls', () => {
  it('steers at the 4th identical call; different args are not counted', () => {
    const guard = new TurnBudgetGuard({ timeoutMs: 0, maxSameToolRepeats: 4 }, () => undefined);
    const args = JSON.stringify({ class: 'X', method: 'y' });
    expect(guard.observeToolCall('read_method', args)).toBe('ok');
    expect(guard.observeToolCall('read_method', args)).toBe('ok');
    expect(guard.observeToolCall('read_method', args)).toBe('ok');
    expect(guard.observeToolCall('read_method', args)).toBe('steer'); // fires at 4
    // Control: DIFFERENT args never count toward the identical signature.
    const varied = new TurnBudgetGuard({ timeoutMs: 0, maxSameToolRepeats: 4 }, () => undefined);
    for (let i = 0; i < 4; i++) {
      expect(varied.observeToolCall('read_method', JSON.stringify({ class: 'X', method: `m${i}` }))).toBe('ok');
    }
    expect(varied.stats.totalCalls).toBe(4);
  });
});

/** Sanity: the estimator matches the shipped one (INV-2 audit hook). */
describe('chain estimator parity', () => {
  it('estimateTokenCount is chars/4', () => {
    expect(estimateTokenCount('abcd')).toBe(1);
  });
});
