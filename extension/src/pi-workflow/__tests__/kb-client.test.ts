import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KbClient } from '../kb-client.js';

describe('KbClient (SA4E-289 Option C)', () => {
  let mockServerManager: any;
  let client: KbClient;

  beforeEach(() => {
    mockServerManager = {
      invokeTool: vi.fn(),
      status: 'running',
    };
    client = new KbClient(mockServerManager);
  });

  it('returns empty array for blank query without calling MCP', async () => {
    const results = await client.search('   ');
    expect(results).toEqual([]);
    expect(mockServerManager.invokeTool).not.toHaveBeenCalled();
  });

  it('searches KB via mem_search tool and parses array response', async () => {
    const expected = [{ id: '1', title: 'Arch Guide', content: 'Clean architecture' }];
    mockServerManager.invokeTool.mockResolvedValueOnce(JSON.stringify(expected));

    const results = await client.search('architecture');
    expect(results).toEqual(expected);
    expect(mockServerManager.invokeTool).toHaveBeenCalledWith('mem_search', {
      query: 'architecture',
      limit: 10,
    });
  });

  it('handles nested entries array in response', async () => {
    mockServerManager.invokeTool.mockResolvedValueOnce(
      JSON.stringify({ entries: [{ id: '2', content: 'Testing note' }] })
    );

    const results = await client.search('testing');
    expect(results).toEqual([{ id: '2', content: 'Testing note' }]);
  });

  it('returns empty array on error gracefully', async () => {
    mockServerManager.invokeTool.mockRejectedValueOnce(new Error('Server unavailable'));
    const results = await client.search('anything');
    expect(results).toEqual([]);
  });

  it('clamps limit between 1 and 100', async () => {
    mockServerManager.invokeTool.mockResolvedValue('[]');

    await client.search('query', { limit: 500 });
    expect(mockServerManager.invokeTool).toHaveBeenCalledWith('mem_search', expect.objectContaining({ limit: 100 }));

    await client.search('query', { limit: -5 });
    expect(mockServerManager.invokeTool).toHaveBeenCalledWith('mem_search', expect.objectContaining({ limit: 1 }));
  });

  it('ingests knowledge into KB via mem_ingest tool', async () => {
    mockServerManager.invokeTool.mockResolvedValueOnce('{"ok":true}');
    const ok = await client.ingest('Important rule', { scope: 'PROJECT' });
    expect(ok).toBe(true);
    expect(mockServerManager.invokeTool).toHaveBeenCalledWith('mem_ingest', {
      content: 'Important rule',
      scope: 'PROJECT',
    });
  });
});
