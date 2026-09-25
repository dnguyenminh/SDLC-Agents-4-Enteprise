import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServerConfigRepository } from '../McpServerConfigRepository.js';

vi.mock('../../../admin/admin-db.js', () => ({
  getDbAdapter: vi.fn(),
}));

import { getDbAdapter } from '../../../admin/admin-db.js';
const mockedGetDbAdapter = getDbAdapter as unknown as ReturnType<typeof vi.fn>;

describe('McpServerConfigRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listEnabledServers returns [] when DB not connected', async () => {
    mockedGetDbAdapter.mockReturnValue({ isConnected: () => false });
    const result = await McpServerConfigRepository.listEnabledServers();
    expect(result).toEqual([]);
  });

  it('listEnabledServers returns [] when query errors', async () => {
    mockedGetDbAdapter.mockReturnValue({
      isConnected: () => true,
      allAsync: vi.fn().mockRejectedValue(new Error('db error')),
    });
    const result = await McpServerConfigRepository.listEnabledServers();
    expect(result).toEqual([]);
  });

  it('mapRow parses valid args/env/autoApprove JSON', async () => {
    mockedGetDbAdapter.mockReturnValue({
      isConnected: () => true,
      getAsync: vi.fn().mockResolvedValue({
        server_id: 'mcp-1',
        project_id: 'proj-1',
        name: 'test-server',
        transport_type: 'stdio',
        url: null,
        command: 'node',
        args: JSON.stringify(['a', 'b']),
        env: JSON.stringify({ KEY: 'value' }),
        disabled: 0,
        auto_approve: JSON.stringify(['tool1']),
      }),
    });
    const cfg = await McpServerConfigRepository.getServerByName('test-server');
    expect(cfg).not.toBeNull();
    if (cfg) {
      expect(cfg.args).toEqual(['a', 'b']);
      expect(cfg.env).toEqual({ KEY: 'value' });
      expect(cfg.autoApprove).toEqual(['tool1']);
      expect(cfg.type).toBe('stdio');
    }
  });

  it('mapRow returns defaults on JSON parse error', async () => {
    mockedGetDbAdapter.mockReturnValue({
      isConnected: () => true,
      getAsync: vi.fn().mockResolvedValue({
        server_id: 'mcp-2',
        project_id: 'proj-1',
        name: 'bad-json',
        transport_type: 'sse',
        url: 'http://example',
        command: null,
        args: 'invalid json',
        env: 'also invalid',
        disabled: 0,
        auto_approve: '[]',
      }),
    });
    const cfg = await McpServerConfigRepository.getServerByName('bad-json');
    expect(cfg).not.toBeNull();
    if (cfg) {
      expect(cfg.args).toEqual([]);
      expect(cfg.env).toEqual({});
    }
  });

  it('normalizeTransport maps streamable-http to httpStream', async () => {
    mockedGetDbAdapter.mockReturnValue({
      isConnected: () => true,
      getAsync: vi.fn().mockResolvedValue({
        server_id: 'mcp-3',
        project_id: 'p',
        name: 'streamable',
        transport_type: 'streamable-http',
        url: 'http://x',
        command: null,
        args: null,
        env: null,
        disabled: 0,
        auto_approve: null,
      }),
    });
    const cfg = await McpServerConfigRepository.getServerByName('streamable');
    expect(cfg?.type).toBe('httpStream');
    expect(cfg?.transportType).toBe('httpStream');
  });

  it('getServerByName returns null when not found', async () => {
    mockedGetDbAdapter.mockReturnValue({
      isConnected: () => true,
      getAsync: vi.fn().mockResolvedValue(null),
    });
    const cfg = await McpServerConfigRepository.getServerByName('missing');
    expect(cfg).toBeNull();
  });

  it('projectId filter is applied in listEnabledServers', async () => {
    const allAsyncMock = vi.fn().mockResolvedValue([
      { server_id: '1', project_id: 'p1', name: 'a', transport_type: 'stdio', url: null, command: 'c', args: null, env: null, disabled: 0, auto_approve: null },
    ]);
    mockedGetDbAdapter.mockReturnValue({
      isConnected: () => true,
      allAsync: allAsyncMock,
    });
    await McpServerConfigRepository.listEnabledServers('p1');
    expect(allAsyncMock).toHaveBeenCalledWith(expect.stringContaining('AND project_id = ?'), ['p1']);
  });
});
