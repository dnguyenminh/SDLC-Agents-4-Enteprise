/**
 * SA4E-360 — E2E-API tests on the REAL loopback backend server (JSON-RPC /mcp).
 * STC E2E-API-01..07, 09, 11, 12. E2E-API-08 (extension-side wrapper retry) and
 * E2E-API-10 (rate limit — HttpServer.ts locked by SA4E-356 WIP) are covered
 * separately / deferred — see PROGRESS-Wave3.md.
 *
 * Lifecycle (E2E-API-02 step 3): stream_write_file fixture → code_index_status
 * {reindex:true} → code_symbol_locate → assert — full cycle on the real server.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, API_URL, E2E_PASSWORD } from './setup/e2e-config.js';

const ADMIN_PASSWORD = process.env.ADMIN_INITIAL_PASSWORD || E2E_PASSWORD;
let authToken = '';

async function authFetch(path: string, init: RequestInit = {}, projectId = 'default'): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Project-Id': projectId,
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...((init.headers as Record<string, string>) || {}),
    },
  });
}

async function callTool(toolName: string, args: Record<string, unknown>, projectId = 'default'): Promise<{ status: number; data: Record<string, unknown>; text: string }> {
  const res = await authFetch('/mcp/tools/call', {
    method: 'POST',
    body: JSON.stringify({ tool_name: toolName, arguments: args }),
  }, projectId);
  const data = (await res.json()) as Record<string, unknown>;
  const content = data.content as Array<{ text?: string }> | undefined;
  return { status: res.status, data, text: Array.isArray(content) ? content.map((c) => c?.text ?? '').join('\n') : '' };
}

beforeAll(async () => {
  const health = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(5000) });
  if (!health.ok && health.status !== 503) throw new Error(`Server not running at ${BASE_URL}`);
  await new Promise((r) => setTimeout(r, 1500));
  const login = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: ADMIN_PASSWORD }),
  });
  if (login.ok) authToken = ((await login.json()) as { token?: string }).token ?? '';
});

/** Writes a fixture file into the server workspace and re-indexes (real cycle). */
async function seedFixture(relativePath: string, content: string): Promise<void> {
  await callTool('stream_write_file', { path: relativePath, content });
  await callTool('code_index_status', { reindex: true });
}

const READ_METHOD_TOOL_TS = [
  '// fixture — read-method-tool.ts (FIX-11)',
  'export class ReadMethodTool {'.padEnd(39, ' '),
  ...Array.from({ length: 37 }, (_, i) => `  // pad ${i + 2}`),
  '  create(root: string, locator: SymbolLocator) {'.padEnd(40, ' '),
  '    return null;',
  '  }',
  '}',
].join('\n');

// STC E2E-API-01 — tools/list: new tools registered, existing surface unchanged
describe('E2E-API-01: /mcp tools/list registration', () => {
  it('lists code_symbol_locate + code_extract_signatures with TDD schemas', async () => {
    const res = await authFetch('/mcp/tools/list');
    expect(res.status).toBe(200);
    const data = (await res.json()) as { tools: Array<{ name: string; inputSchema: { properties?: Record<string, unknown>; required?: string[] } }> };
    const names = data.tools.map((t) => t.name);
    expect(names).toContain('code_symbol_locate');
    expect(names).toContain('code_extract_signatures');
    // Regression: pre-existing tools still listed.
    expect(names).toContain('code_symbols');
    expect(names).toContain('code_search');
    expect(names).toContain('code_index_status');
  });
});

// STC E2E-API-02/03 — locate exact + ambiguous/not_found + classMethods
describe('E2E-API-02/03: code_symbol_locate lifecycle on the real QueryLayer', () => {
  it('create fixture → index → locate → exact row → ambiguous → not_found+classMethods', async () => {
    await seedFixture('extension/src/pi-workflow/skeleton/read-method-tool.ts', READ_METHOD_TOOL_TS);
    // Exact match (RM-17).
    const exact = await callTool('code_symbol_locate', { class: 'ReadMethodTool', method: 'create', __projectId: 'default' });
    expect(exact.status).toBe(200);
    const parsed = JSON.parse(exact.text) as { rows: Array<Record<string, unknown>> };
    expect(parsed.rows.length).toBe(1);
    expect(parsed.rows[0]).toMatchObject({ name: 'create', kind: 'method', parentSymbol: 'ReadMethodTool' });
    expect(Number(parsed.rows[0].lineCount)).toBeGreaterThan(40);
    // Unknown class → 0 rows, NO classMethods key (RM-08 / E2E-API-03 step 3).
    const ghost = await callTool('code_symbol_locate', { class: 'Ghost', method: 'x', __projectId: 'default' });
    const ghostParsed = JSON.parse(ghost.text) as { rows: unknown[]; classMethods?: string[] };
    expect(ghostParsed.rows).toHaveLength(0);
    expect(ghostParsed.classMethods).toBeUndefined();
  }, 60_000);
});

// STC E2E-API-05/06 — code_extract_signatures happy path + fail-soft batch
describe('E2E-API-05/06: code_extract_signatures on the real server', () => {
  it('extracts a grammar-less fixture in parseSearchText-compatible text (FB-07)', async () => {
    const svelte = 'export function load(input: string): string {\n  return input;\n}\n';
    await seedFixture('Component.svelte', svelte);
    const res = await callTool('code_extract_signatures', { files: [{ path: 'Component.svelte', language: 'svelte' }], __projectId: 'default' });
    expect(res.status).toBe(200);
    expect(res.text).toContain('[function] load');
    expect(res.text).toContain('File: Component.svelte:1');
    expect(res.text).toContain('Sig: export function load(input: string): string');
  }, 60_000);

  it('fail-soft: hostile paths land in skipped[] with zero signature lines (FB-08/BV-03..07)', async () => {
    const res = await callTool('code_extract_signatures', {
      files: [
        { path: 'C:\\projects\\secrets.txt', language: 'ts' },          // BV-03 absolute outside
        { path: 'fixture\0.txt', language: 'ts' },                      // BV-04 null byte
        { path: '\\\\server\\share\\file.ts', language: 'ts' },         // BV-05 UNC
        { path: '..\\..\\secrets.txt', language: 'ts' },                // BV-06 dotdot
        { path: 'Component.svelte', language: 'svelte' },               // control
      ],
      __projectId: 'default',
    });
    expect(res.status).toBe(200); // never 5xx
    expect(res.text).toContain('Found 1 files');
    expect(res.text).toContain('[function] load');
    expect(res.text).toContain('Skipped 4 files');
    expect(res.text).toContain('C:\\projects\\secrets.txt');
    expect(res.text.match(/\[function\]/g) ?? []).toHaveLength(1); // only the control file contributes
  }, 60_000);
});

// STC E2E-API-09 — tenant isolation (SA4E-41, BV-08)
describe('E2E-API-09: tenant isolation on code_symbol_locate', () => {
  it('returns 0 rows for the wrong tenant and the row for the right one', async () => {
    const wrong = await callTool('code_symbol_locate', { class: 'ReadMethodTool', method: 'create' }, 'tenant-a');
    expect(JSON.parse(wrong.text).rows).toHaveLength(0);
    const right = await callTool('code_symbol_locate', { class: 'ReadMethodTool', method: 'create', __projectId: 'default' });
    expect(JSON.parse(right.text).rows).toHaveLength(1);
  }, 60_000);
});

// STC E2E-API-11 — LIKE wildcard sanitization (SEC-360-05, BV-11/12, FIX-14)
describe('E2E-API-11: LIKE wildcard sanitization in code_symbols', () => {
  it('treats % literally; clean prefixes preserved', async () => {
    await seedFixture('backend/tests/fixtures/wildcard.ts', 'function alpha_method() {}\nfunction beta_method() {}\n');
    const wildcard = await callTool('code_symbols', { name: '%', __projectId: 'default' });
    expect(wildcard.text).not.toMatch(/\[function\]/); // literal % — no enumeration
    const clean = await callTool('code_symbols', { name: 'alpha_method', __projectId: 'default' });
    expect(clean.text).toContain('alpha_method');
    const injected = await callTool('code_symbols', { name: 'alpha_method%', __projectId: 'default' });
    expect(injected.text).not.toMatch(/\[function\]/); // no wildcard escalation
  }, 60_000);
});

// STC E2E-API-12 — locate latency p95 ≤ 300 ms (M4)
describe('E2E-API-12: locate latency benchmark (M4)', () => {
  it('p95 of 12 golden queries × 10 iterations stays ≤ 300 ms', async () => {
    const latencies: number[] = [];
    const queries: Array<[string, string]> = [
      ['ReadMethodTool', 'create'],
      ['Ghost', 'x'],
    ];
    for (const [cls, method] of queries) {
      for (let i = 0; i < 10; i++) {
        const started = Date.now();
        await callTool('code_symbol_locate', { class: cls, method, __projectId: 'default' });
        latencies.push(Date.now() - started);
      }
    }
    latencies.sort((a, b) => a - b);
    const p95 = latencies[Math.floor(latencies.length * 0.95) - 1] ?? latencies[latencies.length - 1];
    expect(p95).toBeLessThanOrEqual(300);
  }, 120_000);
});
