/**
 * McpBridge tests (split from mcp-bridge.test.ts).
 * Covers: request/response payload interceptors (base64 path <-> content).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';

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
import { McpBridge } from '../mcp-bridge';

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

  describe('Request Interceptor (interceptRequestArgs)', () => {
    it('TC-02: Should convert _as_path to base64 and delete _as_path key', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('dummy_base64_content' as any);
      mcpManagerMock.invokeTool.mockResolvedValue('{"success": true}');

      await bridge.callTool('test-tool', { image_base64_as_path: '/path/to/test.png' });

      expect(mcpManagerMock.invokeTool).toHaveBeenCalledWith('test-tool', { image_base64: 'dummy_base64_content' });
      expect(fs.readFileSync).toHaveBeenCalledWith('/path/to/test.png', 'base64');
    });

    it('TC-03: Should handle missing files gracefully without crashing', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mcpManagerMock.invokeTool.mockResolvedValue('{"success": true}');

      await bridge.callTool('test-tool', { missing_base64_as_path: '/path/to/missing.png' });

      expect(mcpManagerMock.invokeTool).toHaveBeenCalledWith('test-tool', {});
      consoleErrorSpy.mockRestore();
    });

    it('TC-06: Should handle Nested Object Conversion', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('nested_base64' as any);
      mcpManagerMock.invokeTool.mockResolvedValue('{"success": true}');

      const inputArgs = { data: { image_base64_as_path: '/path/to/nested.png' } };
      await bridge.callTool('test-tool', inputArgs);

      expect(mcpManagerMock.invokeTool).toHaveBeenCalledWith('test-tool', { data: { image_base64: 'nested_base64' } });
    });

    it('TC-07: Should handle Array Payload Conversion (arrays are objects in JS)', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('array_base64' as any);
      mcpManagerMock.invokeTool.mockResolvedValue('{"success": true}');

      // Note: McpBridge expects Record<string, unknown> at root, so array must be inside a property
      const inputArgs = { items: [{ image_base64_as_path: '/path/to/array.png' }] };
      await bridge.callTool('test-tool', inputArgs);

      expect(mcpManagerMock.invokeTool).toHaveBeenCalledWith('test-tool', { items: [{ image_base64: 'array_base64' }] });
    });

    it('TC-08: Should handle EISDIR (directory instead of file) gracefully', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('EISDIR'); });
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mcpManagerMock.invokeTool.mockResolvedValue('{"success": true}');

      await bridge.callTool('test-tool', { dir_base64_as_path: '/documents' });

      expect(mcpManagerMock.invokeTool).toHaveBeenCalledWith('test-tool', {});
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('TC-09: Should handle Multiple Base64 Keys', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync)
        .mockReturnValueOnce('base64_1' as any)
        .mockReturnValueOnce('base64_2' as any);
      mcpManagerMock.invokeTool.mockResolvedValue('{"success": true}');

      await bridge.callTool('test-tool', {
        img1_base64_as_path: '/path/1.png',
        img2_base64_as_path: '/path/2.png'
      });

      expect(mcpManagerMock.invokeTool).toHaveBeenCalledWith('test-tool', {
        img1_base64: 'base64_1',
        img2_base64: 'base64_2'
      });
    });
  });

  describe('Response Interceptor (interceptResponse)', () => {
    it('TC-04: Should decode _base64_file and save to disk', async () => {
      mcpManagerMock.invokeTool.mockResolvedValue(JSON.stringify({
        _base64_file: 'SGVsbG8=',
        _filename: 'output.txt'
      }));

      const result = await bridge.callTool('test-tool', {});

      const writeArgs = vi.mocked(fs.writeFileSync).mock.calls[0];
      expect(writeArgs[0]).toContain('output.txt');
      expect(writeArgs[1].toString()).toBe('Hello');
      expect(result).toContain('File saved successfully to:');
    });

    it('TC-05: Should return plain string if response is not JSON', async () => {
      mcpManagerMock.invokeTool.mockResolvedValue("Operation successful");
      const result = await bridge.callTool('test-tool', {});
      expect(result).toBe("Operation successful");
    });

    it('TC-10: Should handle Missing Filename Fallback', async () => {
      mcpManagerMock.invokeTool.mockResolvedValue(JSON.stringify({ _base64_file: 'SGVsbG8=' }));
      const result = await bridge.callTool('test-tool', {});
      const writeArgs = vi.mocked(fs.writeFileSync).mock.calls[0];
      expect(writeArgs[0]).toMatch(/output_\d+\.bin/);
      expect(result).toContain('File saved successfully to:');
    });

    it('TC-20: Should return error instead of raw base64 if workspace is undefined', async () => {
      mockWorkspaceFolders.length = 0; // Empty workspace array
      const rawJson = JSON.stringify({ _base64_file: 'HUGE_BASE64_PAYLOAD', _filename: 'test.png' });
      mcpManagerMock.invokeTool.mockResolvedValue(rawJson);

      const result = await bridge.callTool('test-tool', {});
      expect(result).toBe('Proxy Error: Cannot save base64 file because workspace is undefined.');
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('TC-19: Should return error instead of raw base64 if writeFileSync throws (Disk Full)', async () => {
      mcpManagerMock.invokeTool.mockResolvedValue(JSON.stringify({ _base64_file: 'HUGE_BASE64_PAYLOAD' }));
      vi.mocked(fs.writeFileSync).mockImplementationOnce(() => { throw new Error('ENOSPC: no space left on device'); });

      const result = await bridge.callTool('test-tool', {});
      expect(result).toContain('Proxy Error: Failed to save base64 file to disk');
      expect(result).toContain('ENOSPC');
      expect(result).not.toContain('HUGE_BASE64_PAYLOAD'); // DO NOT leak Base64
    });

    it('TC-12: Should handle Malformed Base64 String without crashing', async () => {
      mcpManagerMock.invokeTool.mockResolvedValue(JSON.stringify({ _base64_file: '!@#$%^&*()', _filename: 'corrupt.bin' }));
      const result = await bridge.callTool('test-tool', {});
      expect(fs.writeFileSync).toHaveBeenCalled();
      expect(result).toContain('File saved successfully to:');
    });
  });

});
