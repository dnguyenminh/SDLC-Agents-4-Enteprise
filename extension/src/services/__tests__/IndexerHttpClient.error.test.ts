import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IndexerHttpClient } from '../IndexerHttpClient';
import { httpPostJson } from '../../utils/http-client-utils';

// Mock vscode
vi.mock('vscode', () => ({
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
