import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IndexerHttpClient } from '../IndexerHttpClient';

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

vi.mock('../../extension', () => ({
  getProjectId: () => 'test-project-123',
}));

vi.mock('../../utils/http-client-utils', () => ({
  httpPostJson: vi.fn(),
}));

describe('IndexerHttpClient token propagation — SA4E-300 GAP 3', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('httpPostJson propagates fresh token via onTokenRefreshed + getCurrentToken', async () => {
    // STC: token-propagate — callback/setter được gọi với fresh token sau 401
    fetchMock
      .mockResolvedValueOnce({ status: 401, text: () => Promise.resolve('Unauthorized') })
      .mockResolvedValueOnce({ status: 200, text: () => Promise.resolve('{"message":"synced"}') });
    const client = new IndexerHttpClient('http://localhost:48721');
    client.setTokenRefresher(vi.fn().mockResolvedValue('fresh-token-123'));
    const cb = vi.fn();
    client.setOnTokenRefreshed(cb);

    const result = await client.syncPegaRulesToKb('proj-abc', 'stale-token');

    expect(result).toEqual({ message: 'synced' });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith('fresh-token-123');
    expect(client.getCurrentToken()).toBe('fresh-token-123');
  });

  it('httpGet propagates fresh token via onTokenRefreshed', async () => {
    fetchMock
      .mockResolvedValueOnce({ status: 401, text: () => Promise.resolve('Unauthorized') })
      .mockResolvedValueOnce({ status: 200, text: () => Promise.resolve('{"status":"ok"}') });
    const client = new IndexerHttpClient('http://localhost:48721');
    client.setTokenRefresher(vi.fn().mockResolvedValue('fresh-get-token'));
    const cb = vi.fn();
    client.setOnTokenRefreshed(cb);

    const result = await client.getEnrichmentStatus('stale-token');

    expect(result.ok).toBe(true);
    expect(cb).toHaveBeenCalledWith('fresh-get-token');
    expect(client.getCurrentToken()).toBe('fresh-get-token');
  });

  it('getCurrentToken undefined before any refresh', () => {
    const client = new IndexerHttpClient('http://localhost:48721');
    expect(client.getCurrentToken()).toBeUndefined();
  });
});
