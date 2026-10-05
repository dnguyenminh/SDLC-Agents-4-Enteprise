/**
 * STC UT-81 + SA4E-337 F5/F7 — IndexerHttpClient document-ingest handling.
 *
 * UT-81 (Bug #3 / BR-12): triggerDocumentIngest must
 *   (a) 200 + invalid JSON  → zeros + "⚠️ Could not parse ingest response"
 *   (b) non-OK status       → zeros + "⚠️ Document ingest failed: status <code>"
 *   and keep the run going (never throw).
 * F5: non-OK bodies are parsed for {error, details, action} (restores what the
 *     httpPostWithDetail rewrite dropped).
 * F7: the "📚 KB:" summary segment is only added when kbIngested + kbErrors > 0.
 *
 * fetch is stubbed per test (global); vscode + extension module are mocked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IndexerHttpClient } from '../IndexerHttpClient';

// Mock vscode (output channel + status bar, same shape as IndexerHttpClient.error.test.ts)
vi.mock('vscode', () => ({
  StatusBarAlignment: { Left: 1, Right: 2 },
  window: {
    createOutputChannel: vi.fn(() => ({ appendLine: vi.fn(), show: vi.fn() })),
    createStatusBarItem: vi.fn(() => ({ show: vi.fn(), dispose: vi.fn() })),
    showInformationMessage: vi.fn(),
  },
  workspace: {
    getConfiguration: vi.fn(() => ({ get: vi.fn() })),
    workspaceFolders: [],
  },
}));

// Dynamic import("../extension") used by buildHeaders
vi.mock('../../extension', () => ({ getProjectId: () => 'test-project-123' }));

// Raw HTTP layer used by httpPostWithDetail → sendBatchWithRetry
vi.mock('../../utils/http-client-utils', () => ({ httpPostJson: vi.fn() }));

import { httpPostJson } from '../../utils/http-client-utils';
const mockHttpPostJson = vi.mocked(httpPostJson);

const channel = () => IndexerHttpClient.getIndexerOutput() as any;
const lines = (): string[] => channel().appendLine.mock.calls.map((c: any[]) => String(c[0]));

function jsonResponse(body: string, status = 200): any {
  return { ok: status >= 200 && status < 300, status, text: async () => body };
}

describe('IndexerHttpClient.triggerDocumentIngest (STC UT-81 / F5)', () => {
  beforeEach(() => {
    channel().appendLine.mockClear();
    channel().show.mockClear();
    mockHttpPostJson.mockReset();
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  // STC UT-81(a) / FSD TC-20 — invalid JSON body → notify + zeros, run continues
  it('UT-81(a): 200 + non-JSON body → zeros + "Could not parse ingest response"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse('<html>bad gateway</html>', 200)));
    const client = new IndexerHttpClient('http://localhost');
    const result = await (client as any).triggerDocumentIngest();
    expect(result).toEqual({ ingested: 0, errors: 0, total: 0 });
    expect(lines().some((l) => l.includes('⚠️ Could not parse ingest response'))).toBe(true);
  });

  // STC UT-81(b) — non-OK status → zeros + status warning, run continues
  it('UT-81(b): HTTP 500 → zeros + "Document ingest failed: status 500"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse('', 500)));
    const client = new IndexerHttpClient('http://localhost');
    const result = await (client as any).triggerDocumentIngest();
    expect(result).toEqual({ ingested: 0, errors: 0, total: 0 });
    expect(lines().some((l) => l.includes('⚠️ Document ingest failed: status 500'))).toBe(true);
    expect(lines().some((l) => l.includes('Could not parse'))).toBe(false); // handled by !ok branch
  });

  // F5 — error envelope (error/details/action) restored on non-OK responses
  it('F5: non-OK body with {error, details, action} surfaces all three lines', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(
      JSON.stringify({ error: 'Server busy', details: 'queue full (limit 3)', action: 'Retry in a few seconds' }),
      503,
    )));
    const client = new IndexerHttpClient('http://localhost');
    const result = await (client as any).triggerDocumentIngest();
    expect(result).toEqual({ ingested: 0, errors: 0, total: 0 });
    const text = lines().join('\n');
    expect(text).toContain('⚠️ Document ingest failed: status 503');
    expect(text).toContain('Server busy');
    expect(text).toContain('Details: queue full (limit 3)');
    expect(text).toContain('Action: Retry in a few seconds');
  });

  // F5 — non-JSON error body (proxy HTML) must not throw, just no detail lines
  it('F5: non-OK non-JSON body → status warning without Details/Action lines', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse('<html>502 Bad Gateway</html>', 502)));
    const client = new IndexerHttpClient('http://localhost');
    const result = await (client as any).triggerDocumentIngest();
    expect(result).toEqual({ ingested: 0, errors: 0, total: 0 });
    const text = lines().join('\n');
    expect(text).toContain('⚠️ Document ingest failed: status 502');
    expect(text).not.toContain('Details:');
    expect(text).not.toContain('Action:');
  });

  it('success path parses counts and logs the KB ingest line', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(JSON.stringify({ ingested: 9, errors: 1, total: 10 }))));
    const client = new IndexerHttpClient('http://localhost');
    const result = await (client as any).triggerDocumentIngest();
    expect(result).toEqual({ ingested: 9, errors: 1, total: 10 });
    expect(lines().some((l) => l.includes('KB ingest: 9/10 files ingested, 1 errors'))).toBe(true);
  });

  it('network failure → zeros + error line (run continues)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));
    const client = new IndexerHttpClient('http://localhost');
    const result = await (client as any).triggerDocumentIngest();
    expect(result).toEqual({ ingested: 0, errors: 0, total: 0 });
    expect(lines().some((l) => l.includes('⚠️ Document ingest error: ECONNREFUSED'))).toBe(true);
  });
});

describe('IndexerHttpClient.ingestDocuments — F7 KB summary line', () => {
  const report = { report: vi.fn() };

  beforeEach(() => {
    channel().appendLine.mockClear();
    channel().show.mockClear();
    mockHttpPostJson.mockReset();
    mockHttpPostJson.mockResolvedValue({});
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  it('F7: no "📚 KB" segment when the KB run reported nothing (0 ingested, 0 errors)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(JSON.stringify({ ingested: 0, errors: 0, total: 0 }))));
    const client = new IndexerHttpClient('http://localhost');
    const result = await client.ingestDocuments(
      [{ path: 'documents/a.md', type: 'document', ticket: 'SA4E-337', content: '# A' }],
      report as any,
    );
    expect(result.ingested).toBe(1);
    expect(result.summary).toContain('✅ Indexed: 1 files');
    expect(result.summary).not.toContain('📚 KB');
    // detail line still goes to the Output channel for diagnostics
    expect(lines().some((l) => l.includes('KB ingest: 0/0'))).toBe(true);
  });

  it('F7: "📚 KB: n ingested" present when KB ingest reported results', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(JSON.stringify({ ingested: 3, errors: 1, total: 4 }))));
    const client = new IndexerHttpClient('http://localhost');
    const result = await client.ingestDocuments(
      [{ path: 'documents/a.md', type: 'document', ticket: 'SA4E-337', content: '# A' }],
      report as any,
    );
    expect(result.ingested).toBe(1);
    expect(result.summary).toContain('📚 KB: 3 ingested');
  });

  it('F7: no "📚 KB" segment when nothing was staged (KB ingest never triggered)', async () => {
    const client = new IndexerHttpClient('http://localhost');
    const result = await client.ingestDocuments(
      [{ path: 'documents/empty.md', type: 'document', ticket: 'SA4E-337', content: '' }],
      report as any,
    );
    expect(result.ingested).toBe(0);
    expect(result.errors).toBe(1);
    expect(result.summary).not.toContain('📚 KB');
    expect(result.summary).toContain('⚠️ Failed: 1');
  });
});
