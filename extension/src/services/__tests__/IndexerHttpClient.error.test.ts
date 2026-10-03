import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IndexerHttpClient } from '../IndexerHttpClient';
import { httpPostJson } from '../../utils/http-client-utils';

// Mock vscode
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

// Mock the dynamic import("../extension") used by buildHeaders
vi.mock('../../extension', () => ({
  getProjectId: () => 'test-project-123',
}));

// Mock raw HTTP layer so tests control err.body shapes (SA4E-300)
vi.mock('../../utils/http-client-utils', () => ({
  httpPostJson: vi.fn(),
}));

const mockHttpPostJson = vi.mocked(httpPostJson);

describe('IndexerHttpClient error propagation', () => {
  beforeEach(() => {
    mockHttpPostJson.mockReset();
  });

  it('getIndexerOutput returns singleton channel', () => {
    const channel1 = IndexerHttpClient.getIndexerOutput();
    const channel2 = IndexerHttpClient.getIndexerOutput();
    expect(channel1).toBe(channel2);
    expect(typeof channel1.appendLine).toBe('function');
  });

  it('syncCodeSymbols returns string|null', async () => {
    const client = new IndexerHttpClient('http://localhost');
    const result = await client.syncCodeSymbols();
    expect(result === null || typeof result === 'string').toBe(true);
  });

  // SA4E-300 / BUG-001: httpPostWithDetail must forward err.body details/action verbatim
  it.each([429, 500])('httpPostWithDetail forwards err.body details/action on HTTP %i', async (statusCode) => {
    mockHttpPostJson.mockRejectedValueOnce({
      statusCode,
      body: { error: 'Server busy', details: 'queue full (limit 3)', action: 'Retry in a few seconds' },
    });
    const client = new IndexerHttpClient('http://localhost');
    const result = await (client as any).httpPostWithDetail(
      'http://localhost/api/index/source', { files: [] }, undefined,
    );
    expect(result).toEqual({
      ok: false,
      error: 'Server busy',
      details: 'queue full (limit 3)',
      action: 'Retry in a few seconds',
      status: statusCode,
    });
  });

  it('httpPostWithDetail maps 401 to Unauthorized but keeps details/action', async () => {
    mockHttpPostJson.mockRejectedValueOnce({
      statusCode: 401,
      body: { error: 'token expired', details: 'JWT expired', action: 'Re-authenticate' },
    });
    const client = new IndexerHttpClient('http://localhost');
    const result = await (client as any).httpPostWithDetail(
      'http://localhost/api/index/source', { files: [] }, undefined,
    );
    expect(result).toEqual({
      ok: false,
      error: 'Unauthorized',
      details: 'JWT expired',
      action: 'Re-authenticate',
      status: 401,
    });
  });

  it('httpPostWithDetail ok-path keeps details/action undefined', async () => {
    mockHttpPostJson.mockResolvedValueOnce({});
    const client = new IndexerHttpClient('http://localhost');
    const result = await (client as any).httpPostWithDetail(
      'http://localhost/api/index/source', { files: [] }, undefined,
    );
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.details).toBeUndefined();
    expect(result.action).toBeUndefined();
  });

  // BUG-001: sendBatchWithRetry return type must carry details/action (TS2339 fix)
  it('sendBatchWithRetry propagates details/action without retry (maxRetries=0)', async () => {
    mockHttpPostJson.mockRejectedValueOnce({
      statusCode: 500,
      body: { error: 'Disk full', details: 'ENOSPC on Temp volume', action: 'Free disk space' },
    });
    const client = new IndexerHttpClient('http://localhost');
    const result = await (client as any).sendBatchWithRetry(
      'http://localhost/api/index/source', { files: [] }, undefined, 0,
    );
    expect(result.details).toBe('ENOSPC on Temp volume');
    expect(result.action).toBe('Free disk space');
    expect(result.status).toBe(500);
    expect(mockHttpPostJson).toHaveBeenCalledTimes(1);
  });

  it('sendBatchWithRetry early-returns 401 with details/action intact (no retry)', async () => {
    mockHttpPostJson.mockRejectedValueOnce({
      statusCode: 401,
      body: { error: 'expired', details: 'JWT expired', action: 'Re-authenticate' },
    });
    const client = new IndexerHttpClient('http://localhost');
    const result = await (client as any).sendBatchWithRetry(
      'http://localhost/api/index/source', { files: [] }, undefined, 3,
    );
    expect(result).toMatchObject({
      ok: false,
      error: 'Unauthorized',
      details: 'JWT expired',
      action: 'Re-authenticate',
      status: 401,
    });
    expect(mockHttpPostJson).toHaveBeenCalledTimes(1);
  });

  it('sendBatchWithRetry propagates details/action when retries are exhausted', async () => {
    mockHttpPostJson.mockRejectedValue({
      statusCode: 500,
      body: { error: 'Disk full', details: 'ENOSPC on Temp volume', action: 'Free disk space' },
    });
    const client = new IndexerHttpClient('http://localhost');
    const result = await (client as any).sendBatchWithRetry(
      'http://localhost/api/index/source', { files: [] }, undefined, 1,
    );
    expect(result.details).toBe('ENOSPC on Temp volume');
    expect(result.action).toBe('Free disk space');
    expect(result.status).toBe(500);
    expect(mockHttpPostJson).toHaveBeenCalledTimes(2);
  }, 10000);

  it('sendBatchWithRetry ok-path keeps details/action undefined', async () => {
    mockHttpPostJson.mockResolvedValueOnce({});
    const client = new IndexerHttpClient('http://localhost');
    const result = await (client as any).sendBatchWithRetry(
      'http://localhost/api/index/source', { files: [] }, undefined, 3,
    );
    expect(result.ok).toBe(true);
    expect(result.details).toBeUndefined();
    expect(result.action).toBeUndefined();
  });
});

describe('IndexerHttpClient progress polling', () => {
  const channel = () => IndexerHttpClient.getIndexerOutput() as any;

  beforeEach(() => {
    channel().appendLine.mockClear();
    channel().show.mockClear();
  });

  it.each([
    [{ percentage: 31 }, 31],
    [{ current: 861, total: 2753 }, 31],
    [{ current: 0, total: 0 }, null],
    [{}, null],
    [null, null],
  ])('progressPct(%j) === %s', (progress, expected) => {
    expect(IndexerHttpClient.progressPct(progress)).toBe(expected);
  });

  it('formatIndexError prefers error.message and appends file', () => {
    expect(IndexerHttpClient.formatIndexError({ error: { message: 'boom', file: 'a.ts' } }))
      .toBe('boom (file: a.ts)');
    expect(IndexerHttpClient.formatIndexError({ message: 'legacy' })).toBe('legacy');
    expect(IndexerHttpClient.formatIndexError({})).toBe('unknown error');
  });

  it('logTerminalIndexState complete logs success without phantom error detail', () => {
    IndexerHttpClient.logTerminalIndexState('complete',
      { phase: 'complete', current: 10, total: 10, percentage: 100, elapsedMs: 1000 }, false);
    const lines = channel().appendLine.mock.calls.map((c: any[]) => String(c[0]));
    expect(lines.some((l: string) => l.includes('✅ Index complete'))).toBe(true);
    expect(lines.some((l: string) => l.includes('unknown error'))).toBe(false);
    expect(channel().show).not.toHaveBeenCalled();
  });

  it('logTerminalIndexState failed surfaces error.message and stack', () => {
    IndexerHttpClient.logTerminalIndexState('failed',
      { phase: 'error', current: 0, total: 10, percentage: 0, error: { message: 'no such column', stack: 'line1\nline2' } }, true);
    const lines = channel().appendLine.mock.calls.map((c: any[]) => String(c[0]));
    expect(lines.some((l: string) => l.includes('❌ Index failed') && l.includes('no such column'))).toBe(true);
    expect(lines.some((l: string) => l.includes('Stack:'))).toBe(true);
    expect(channel().show).toHaveBeenCalled();
  });

  it('pollIndexProgress exits promptly on phase=complete', async () => {
    const body = JSON.stringify({ status: 'completed', phase: 'complete', current: 10, total: 10, percentage: 100, elapsedMs: 1000 });
    vi.stubGlobal('fetch', vi.fn(async () => ({ status: 200, text: async () => body } as any)));
    try {
      const vscode = await import('vscode');
      const sbm = vi.mocked(vscode.window.createStatusBarItem);
      sbm.mockClear();
      await new IndexerHttpClient('http://localhost').pollIndexProgress(undefined, 30000);
      expect(sbm.mock.results[0].value.text).toBe('$(check) Index complete');
      const lines = channel().appendLine.mock.calls.map((c: any[]) => String(c[0]));
      expect(lines.some((l: string) => l.includes('✅ Index complete'))).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  }, 15000);

  it('pollIndexProgress timeout reports no phantom unknown-error detail', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
    try {
      await new IndexerHttpClient('http://localhost').pollIndexProgress(undefined, 10);
      const lines = channel().appendLine.mock.calls.map((c: any[]) => String(c[0]));
      const timeoutLine = lines.find((l: string) => l.includes('Index timeout'));
      expect(timeoutLine).toBeTruthy();
      expect(timeoutLine).not.toContain('unknown error');
    } finally {
      vi.unstubAllGlobals();
    }
  }, 15000);
});
