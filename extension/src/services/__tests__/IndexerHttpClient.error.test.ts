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

  // SA4E-300: per-file write failures arrive INSIDE a 200 body — the parsed
  // body must be exposed to callers (previously discarded on success).
  it('httpPostWithDetail returns parsed body on 2xx success', async () => {
    mockHttpPostJson.mockResolvedValueOnce({
      written: 18,
      skipped: 0,
      rejected: ['bad1.ts', 'bad2.ts'],
      rejectedReasons: [
        { file: 'bad1.ts', code: 'EACCES', message: 'Unsafe path' },
        { file: 'bad2.ts', code: 'ENOSPC', message: 'No space left on device' },
      ],
    } as any);
    const client = new IndexerHttpClient('http://localhost');
    const result = await (client as any).httpPostWithDetail(
      'http://localhost/api/index/source', { files: [] }, undefined,
    );
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.body.written).toBe(18);
    expect(result.body.rejectedReasons).toHaveLength(2);
  });

  // SA4E-300: batchWriteOutcome parses both response shapes and falls back
  // for legacy bodies (no written/indexed field → assume whole batch wrote).
  it('batchWriteOutcome parses written/indexed shapes and legacy fallback', () => {
    const source = (IndexerHttpClient as any).batchWriteOutcome(
      { written: 17, rejectedReasons: [{ file: 'f.ts', code: 'EACCES', message: 'x' }] }, 20,
    );
    expect(source).toEqual({
      written: 17,
      failed: 3,
      rejectedReasons: [{ file: 'f.ts', code: 'EACCES', message: 'x' }],
    });

    const docs = (IndexerHttpClient as any).batchWriteOutcome({ indexed: 5 }, 6);
    expect(docs.written).toBe(5);
    expect(docs.failed).toBe(1);
    expect(docs.rejectedReasons).toEqual([]);

    const legacy = (IndexerHttpClient as any).batchWriteOutcome(undefined, 20);
    expect(legacy).toEqual({ written: 20, failed: 0, rejectedReasons: [] });

    // defensive: server must never report MORE writes than files sent
    const overclaim = (IndexerHttpClient as any).batchWriteOutcome({ written: 99 }, 20);
    expect(overclaim.written).toBe(20);
    expect(overclaim.failed).toBe(0);
  });

  // SA4E-300: file-level retry — transient rejections (ENOSPC…) are retried
  // until accepted; permanent ones (unsafe-path EACCES) are never retried.
  it('isRetryableRejection classifies transient vs permanent failures', () => {
    const fn = (IndexerHttpClient as any).isRetryableRejection;
    expect(fn({ code: 'ENOSPC', message: 'No space left on device' })).toBe(true);
    expect(fn({ code: 'EIO', message: 'i/o error' })).toBe(true);
    expect(fn({ code: 'EBUSY', message: 'resource busy' })).toBe(true);
    expect(fn({ code: 'UNKNOWN', message: 'something' })).toBe(true);
    expect(fn({ code: 'EACCES', message: 'Unsafe path: must be a relative path staying within the temp directory' })).toBe(false);
    expect(fn({ code: 'ENOENT', message: 'no such file' })).toBe(false);
    expect(fn({ code: 'ENAMETOOLONG', message: 'name too long' })).toBe(false);
  });

  it('drainRetryQueue retries transient failures until the file is accepted', async () => {
    IndexerHttpClient.FILE_RETRY_BASE_DELAY_MS = 1; // keep the test fast
    try {
      mockHttpPostJson
        .mockResolvedValueOnce({
          written: 0, rejected: ['a.ts'],
          rejectedReasons: [{ file: 'a.ts', code: 'ENOSPC', message: 'No space left on device' }],
        } as any)
        .mockResolvedValueOnce({ written: 1, rejected: [], rejectedReasons: [] } as any);
      const client = new IndexerHttpClient('http://localhost');
      const queue: any[] = [{ path: 'a.ts', content: 'x' }];
      const res = await (client as any).drainRetryQueue(queue, 'http://localhost/api/index/source', undefined, 3);
      expect(res.uploaded).toBe(1);
      expect(res.errors).toBe(0);
      expect(queue).toHaveLength(0);
      expect(mockHttpPostJson).toHaveBeenCalledTimes(2); // 1 failed round + 1 success round
    } finally {
      IndexerHttpClient.FILE_RETRY_BASE_DELAY_MS = 1000;
    }
  });

  it('drainRetryQueue never re-sends permanent unsafe-path rejections', async () => {
    IndexerHttpClient.FILE_RETRY_BASE_DELAY_MS = 1;
    try {
      mockHttpPostJson.mockResolvedValueOnce({
        written: 0, rejected: ['../evil.ts'],
        rejectedReasons: [{ file: '../evil.ts', code: 'EACCES', message: 'Unsafe path: must be a relative path staying within the temp directory' }],
      } as any);
      const client = new IndexerHttpClient('http://localhost');
      const queue: any[] = [{ path: '../evil.ts', content: 'x' }];
      const res = await (client as any).drainRetryQueue(queue, 'http://localhost/api/index/source', undefined, 3);
      expect(res.errors).toBe(1);
      expect(res.uploaded).toBe(0);
      expect(queue).toHaveLength(0);
      expect(mockHttpPostJson).toHaveBeenCalledTimes(1); // no retry rounds for permanent
    } finally {
      IndexerHttpClient.FILE_RETRY_BASE_DELAY_MS = 1000;
    }
  });

  it('drainRetryQueue stops after the configured rounds and keeps leftovers queued', async () => {
    IndexerHttpClient.FILE_RETRY_BASE_DELAY_MS = 1;
    try {
      mockHttpPostJson.mockResolvedValue({
        written: 0, rejected: ['a.ts'],
        rejectedReasons: [{ file: 'a.ts', code: 'ENOSPC', message: 'No space left on device' }],
      } as any);
      const client = new IndexerHttpClient('http://localhost');
      const queue: any[] = [{ path: 'a.ts', content: 'x' }];
      const res = await (client as any).drainRetryQueue(queue, 'http://localhost/api/index/source', undefined, 2);
      expect(res.uploaded).toBe(0);
      expect(res.errors).toBe(0); // nothing permanent — file stays queued
      expect(queue).toHaveLength(1);
      expect(mockHttpPostJson).toHaveBeenCalledTimes(2); // exactly `rounds` attempts
    } finally {
      IndexerHttpClient.FILE_RETRY_BASE_DELAY_MS = 1000;
    }
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
