/**
 * McpBridge tests (split from mcp-bridge.test.ts).
 * Covers: callTool timeout protection and listTools fetch/timeout handling.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mocks ---
const mockWorkspaceFolders = [{ uri: { fsPath: '/mock/workspace' } }];

vi.mock('vscode', () => ({
  workspace: {
    get workspaceFolders() {
      return mockWorkspaceFolders;
    }
  }
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});

// Import after mocks
import { McpBridge, McpToolTimeoutError } from '../mcp-bridge';

describe('McpBridge & Payload Interceptors', () => {
  let mcpManagerMock: any;
  let bridge: McpBridge;

  beforeEach(() => {
    vi.clearAllMocks();
    mockWorkspaceFolders.length = 1;
    mockWorkspaceFolders[0] = { uri: { fsPath: '/mock/workspace' } };

    mcpManagerMock = {
      status: 'running',
      invokeTool: vi.fn(),
      port: 12345
    };
    bridge = new McpBridge(mcpManagerMock);
  });

  describe('Timeout Protection (callTool)', () => {
    it('TC-15: Should throw McpToolTimeoutError if backend hangs', async () => {
      // Mock an invokeTool that takes longer than the timeout
      mcpManagerMock.invokeTool.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100)));

      // Call with 10ms timeout
      await expect(bridge.callTool('test-tool', {}, 10)).rejects.toThrow(McpToolTimeoutError);
    });
  });

  describe('listTools API (Fetch & Timeout)', () => {
    beforeEach(() => {
      // Setup fetch mock
      global.fetch = vi.fn();
    });

    it('TC-16: Should fetch tools successfully', async () => {
      const mockTools = [{ name: 'tool_a' }];
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ result: { tools: mockTools } })
      } as any);

      const tools = await bridge.listTools();
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('tool_a');
    });

    it('TC-17: Should throw McpToolTimeoutError on fetch timeout (AbortError)', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      vi.mocked(global.fetch).mockRejectedValue(abortError);

      await expect(bridge.listTools()).rejects.toThrow(McpToolTimeoutError);
    });

    it('TC-18: Should throw Error on HTTP non-200', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      } as any);

      await expect(bridge.listTools()).rejects.toThrow('HTTP 500: Internal Server Error');
    });
  });

});
