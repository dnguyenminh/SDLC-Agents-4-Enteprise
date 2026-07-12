import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// --- Mocks ---
vi.mock('vscode', () => ({
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/mock/workspace' } }]
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
import { McpBridge } from '../src/langgraph/core/mcp-bridge';
import { BaseNode } from '../src/langgraph/core/base-node';
import type { PipelineState } from '../src/langgraph/core/state';
import { StreamHandler } from '../src/langgraph/core/stream-handler';

// Create a dummy subclass to test abstract BaseNode's protected discoverTools
class MockNode extends BaseNode {
  constructor(bridge: McpBridge) {
    super('test-node', bridge, new StreamHandler());
  }

  async execute(state: PipelineState): Promise<Partial<PipelineState>> {
    return {};
  }

  public testDiscoverTools(query: string) {
    return this.discoverTools(query);
  }
}

describe('McpBridge & Payload Interceptors', () => {
  let mcpManagerMock: any;
  let bridge: McpBridge;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock the McpServerManager
    mcpManagerMock = {
      status: 'running',
      invokeTool: vi.fn(),
      port: 12345
    };

    bridge = new McpBridge(mcpManagerMock);
  });

  describe('Request Interceptor (interceptRequestArgs)', () => {
    it('TC-02: Should convert _as_path to base64 and delete _as_path key', async () => {
      // Setup fs mocks
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('dummy_base64_content' as any);
      
      mcpManagerMock.invokeTool.mockResolvedValue('{"success": true}');

      const inputArgs = {
        image_base64_as_path: '/path/to/test.png',
        other_param: 123
      };

      await bridge.callTool('test-tool', inputArgs);

      // Verify the modified args sent to backend
      expect(mcpManagerMock.invokeTool).toHaveBeenCalledWith('test-tool', {
        image_base64: 'dummy_base64_content',
        other_param: 123
      });

      // Verify fs calls
      expect(fs.existsSync).toHaveBeenCalledWith('/path/to/test.png');
      expect(fs.readFileSync).toHaveBeenCalledWith('/path/to/test.png', 'base64');
    });

    it('TC-03: Should handle missing files gracefully without crashing', async () => {
      // Setup fs mocks
      vi.mocked(fs.existsSync).mockReturnValue(false); // File doesn't exist
      
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mcpManagerMock.invokeTool.mockResolvedValue('{"success": true}');

      const inputArgs = {
        missing_base64_as_path: '/path/to/missing.png'
      };

      await bridge.callTool('test-tool', inputArgs);

      // Verify the missing key is simply removed, backend gets empty object
      expect(mcpManagerMock.invokeTool).toHaveBeenCalledWith('test-tool', {});
      
      consoleErrorSpy.mockRestore();
    });
  });

  describe('Response Interceptor (interceptResponse)', () => {
    it('TC-04: Should decode _base64_file and save to disk', async () => {
      const mockResultStr = JSON.stringify({
        _base64_file: 'SGVsbG8=',
        _filename: 'output.txt'
      });

      // We bypass the actual invokeTool and test the private interceptResponse via callTool
      // by making invokeTool return our mock string
      mcpManagerMock.invokeTool.mockResolvedValue(mockResultStr);

      const result = await bridge.callTool('test-tool', {});

      // Verify fs operations
      expect(fs.mkdirSync).toHaveBeenCalledWith(
        path.join('/mock/workspace', 'documents', 'tmp'), 
        { recursive: true }
      );
      
      expect(fs.writeFileSync).toHaveBeenCalled();
      const writeArgs = vi.mocked(fs.writeFileSync).mock.calls[0];
      expect(writeArgs[0]).toContain('output.txt');
      expect(writeArgs[1].toString()).toBe('Hello');

      // Verify returned string to LLM
      expect(result).toContain('File saved successfully to:');
    });

    it('TC-05: Should return plain string if response is not JSON', async () => {
      const plainTextResponse = "Operation successful";
      mcpManagerMock.invokeTool.mockResolvedValue(plainTextResponse);

      const result = await bridge.callTool('test-tool', {});
      
      // Returns untouched
      expect(result).toBe(plainTextResponse);
    });
  });

  describe('Schema Rewrite (discoverTools)', () => {
    it('TC-01: Should append _as_path to schema properties containing base64', async () => {
      const mockNode = new MockNode(bridge);
      
      const mockBackendTools = [
        {
          name: 'drawio_export_png',
          inputSchema: {
            properties: {
              xml_content: { type: 'string' },
              image_base64: { type: 'string' }
            },
            required: ['xml_content', 'image_base64']
          }
        }
      ];

      // Since discoverTools uses fetch, we mock global fetch
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ result: { tools: mockBackendTools } })
      });

      const schemaStr = await mockNode.testDiscoverTools('drawio');
      const rewrittenTools = JSON.parse(schemaStr);
      
      const props = rewrittenTools[0].inputSchema.properties;
      const required = rewrittenTools[0].inputSchema.required;

      expect(props.image_base64).toBeUndefined();
      expect(props.image_base64_as_path).toBeDefined();
      expect(props.image_base64_as_path.description).toContain('Proxy will convert to base64');
      
      expect(required).not.toContain('image_base64');
      expect(required).toContain('image_base64_as_path');
    });
  });
});
