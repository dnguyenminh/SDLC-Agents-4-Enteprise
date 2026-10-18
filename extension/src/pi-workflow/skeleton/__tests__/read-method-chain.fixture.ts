/**
 * SA4E-360 — shared fixture for the read_method chain integration tests
 * (TDD task T9): real QueryLayer over a fixture SQLite index (SCHEMA_V1),
 * real JSON-RPC /mcp surface on an in-process HTTP server (loopback), real
 * HttpMcpCaller fetch chain, real ReadMethodTool/gates. ONLY the LLM provider
 * is absent (no inference in CI). Fixture data: read-method-testdata.csv
 * RM-14..RM-17; golden-query-set.csv.
 */
import { beforeAll, afterAll } from 'vitest';
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
import { IndexFreshnessChecker } from '../index-freshness-checker.js';
import type { SymbolLocator } from '../symbol-locator.js';

export const WORKSPACE = fs.mkdtempSync(path.join(os.tmpdir(), 'sa4e-360-chain-'));
export const PROJECT = 'default';
let adapter: SqliteAdapter;
let server: http.Server;
let baseUrl = '';

export const chainAdapter = (): SqliteAdapter => adapter;
export const chainBaseUrl = (): string => baseUrl;

/** Golden query set (documents/SA4E-360/testdata/golden-query-set.csv). */
export const GOLDEN: Array<[string, string, 'ok' | 'not_found']> = [
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

/** Registers the beforeAll/afterAll bootstrap (call once per test file). */
export function setupReadMethodChainFixture(): void {
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
}

export function makeTool(): { tool: ReturnType<typeof createReadMethodTool>; locator: SymbolLocator } {
  const locator = new McpSymbolLocator(new HttpMcpCaller(baseUrl));
  return { tool: createReadMethodTool(WORKSPACE, locator, new IndexFreshnessChecker({ reindex: () => locator.reindex() })), locator };
}

export async function executeReadMethod(cls: string, method: string): Promise<Record<string, unknown>> {
  const { tool } = makeTool();
  const result = (await tool.execute('c1', { class: cls, method })) as { content: Array<{ text: string }> };
  return JSON.parse(result.content[0].text) as Record<string, unknown>;
}
