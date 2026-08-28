import { describe, it, expect, vi, afterEach } from 'vitest';
import { JiraApiClient } from '../clients/jira-client.js';
import { RateLimiter } from '../clients/rate-limiter.js';
import type { HttpClientConfig } from '../models/types.js';

function createTestConfig(): HttpClientConfig {
  return {
    baseUrl: 'https://test.atlassian.net',
    authHeaders: async () => ({ Authorization: 'Basic test' }),
    rateLimiter: new RateLimiter(100, 60000),
    timeouts: { default: 5000, upload: 30000 },
  };
}

describe('IT-DOWN-01: JiraApiClient.downloadAttachment — successful download by URL', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns buffer, mime, size, filename', async () => {
    const content = 'Hello PDF';
    const headers = new Headers();
    headers.set('content-type', 'application/pdf');
    headers.set('content-disposition', 'attachment; filename="test.pdf"');

    const arrayBuf = new TextEncoder().encode(content).buffer;

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers,
      arrayBuffer: async () => arrayBuf,
    }));

    const client = new JiraApiClient(createTestConfig());
    const result = await client.downloadAttachment('https://test.atlassian.net/secure/attachment/123/test.pdf');
    expect(result.mimeType).toBe('application/pdf');
    expect(result.filename).toBe('test.pdf');
    expect(result.size).toBe(Buffer.from(content).length);
    expect(result.buffer.toString()).toBe(content);
  });
});

describe('IT-DOWN-02: JiraApiClient.downloadAttachment — 404 error', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      headers: new Headers(),
      text: async () => 'Not Found',
    }));

    const client = new JiraApiClient(createTestConfig());
    await expect(client.downloadAttachment('https://invalid/url')).rejects.toThrow('Download failed: HTTP 404');
  });
});

describe('IT-DOWN-03: JiraApiClient.getAttachment — metadata fetch', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('calls correct attachment endpoint', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => JSON.stringify({ id: '123', content: 'https://test.atlassian.net/secure/attachment/123/file.txt' }),
    }));

    const client = new JiraApiClient(createTestConfig());
    const res = await client.getAttachment('123');
    expect(res.status).toBe(200);
    expect(res.data.content).toBe('https://test.atlassian.net/secure/attachment/123/file.txt');
    const fetchCall = (fetch as any).mock.calls[0];
    expect(fetchCall[0]).toContain('/rest/api/2/attachment/123');
  });
});
