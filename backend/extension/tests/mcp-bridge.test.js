"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// --- Mocks ---
vitest_1.vi.mock('vscode', () => ({
    workspace: {
        workspaceFolders: [{ uri: { fsPath: '/mock/workspace' } }]
    }
}));
vitest_1.vi.mock('fs', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        existsSync: vitest_1.vi.fn(),
        readFileSync: vitest_1.vi.fn(),
        writeFileSync: vitest_1.vi.fn(),
        mkdirSync: vitest_1.vi.fn(),
    };
});
// Import after mocks
const mcp_bridge_1 = require("../src/langgraph/core/mcp-bridge");
const base_node_1 = require("../src/langgraph/core/base-node");
const stream_handler_1 = require("../src/langgraph/core/stream-handler");
// Create a dummy subclass to test abstract BaseNode's protected discoverTools
class MockNode extends base_node_1.BaseNode {
    constructor(bridge) {
        super('test-node', bridge, new stream_handler_1.StreamHandler());
    }
    async execute(state) {
        return {};
    }
    testDiscoverTools(query) {
        return this.discoverTools(query);
    }
}
(0, vitest_1.describe)('McpBridge & Payload Interceptors', () => {
    let mcpManagerMock;
    let bridge;
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
        // Mock the McpServerManager
        mcpManagerMock = {
            status: 'running',
            invokeTool: vitest_1.vi.fn(),
            port: 12345
        };
        bridge = new mcp_bridge_1.McpBridge(mcpManagerMock);
    });
    (0, vitest_1.describe)('Request Interceptor (interceptRequestArgs)', () => {
        (0, vitest_1.it)('TC-02: Should convert _as_path to base64 and delete _as_path key', async () => {
            // Setup fs mocks
            vitest_1.vi.mocked(fs.existsSync).mockReturnValue(true);
            vitest_1.vi.mocked(fs.readFileSync).mockReturnValue('dummy_base64_content');
            mcpManagerMock.invokeTool.mockResolvedValue('{"success": true}');
            const inputArgs = {
                image_base64_as_path: '/path/to/test.png',
                other_param: 123
            };
            await bridge.callTool('test-tool', inputArgs);
            // Verify the modified args sent to backend
            (0, vitest_1.expect)(mcpManagerMock.invokeTool).toHaveBeenCalledWith('test-tool', {
                image_base64: 'dummy_base64_content',
                other_param: 123
            });
            // Verify fs calls
            (0, vitest_1.expect)(fs.existsSync).toHaveBeenCalledWith('/path/to/test.png');
            (0, vitest_1.expect)(fs.readFileSync).toHaveBeenCalledWith('/path/to/test.png', 'base64');
        });
        (0, vitest_1.it)('TC-03: Should handle missing files gracefully without crashing', async () => {
            // Setup fs mocks
            vitest_1.vi.mocked(fs.existsSync).mockReturnValue(false); // File doesn't exist
            const consoleErrorSpy = vitest_1.vi.spyOn(console, 'error').mockImplementation(() => { });
            mcpManagerMock.invokeTool.mockResolvedValue('{"success": true}');
            const inputArgs = {
                missing_base64_as_path: '/path/to/missing.png'
            };
            await bridge.callTool('test-tool', inputArgs);
            // Verify the missing key is simply removed, backend gets empty object
            (0, vitest_1.expect)(mcpManagerMock.invokeTool).toHaveBeenCalledWith('test-tool', {});
            consoleErrorSpy.mockRestore();
        });
    });
    (0, vitest_1.describe)('Response Interceptor (interceptResponse)', () => {
        (0, vitest_1.it)('TC-04: Should decode _base64_file and save to disk', async () => {
            const mockResultStr = JSON.stringify({
                _base64_file: 'SGVsbG8=',
                _filename: 'output.txt'
            });
            // We bypass the actual invokeTool and test the private interceptResponse via callTool
            // by making invokeTool return our mock string
            mcpManagerMock.invokeTool.mockResolvedValue(mockResultStr);
            const result = await bridge.callTool('test-tool', {});
            // Verify fs operations
            (0, vitest_1.expect)(fs.mkdirSync).toHaveBeenCalledWith(path.join('/mock/workspace', 'documents', 'tmp'), { recursive: true });
            (0, vitest_1.expect)(fs.writeFileSync).toHaveBeenCalled();
            const writeArgs = vitest_1.vi.mocked(fs.writeFileSync).mock.calls[0];
            (0, vitest_1.expect)(writeArgs[0]).toContain('output.txt');
            (0, vitest_1.expect)(writeArgs[1].toString()).toBe('Hello');
            // Verify returned string to LLM
            (0, vitest_1.expect)(result).toContain('File saved successfully to:');
        });
        (0, vitest_1.it)('TC-05: Should return plain string if response is not JSON', async () => {
            const plainTextResponse = "Operation successful";
            mcpManagerMock.invokeTool.mockResolvedValue(plainTextResponse);
            const result = await bridge.callTool('test-tool', {});
            // Returns untouched
            (0, vitest_1.expect)(result).toBe(plainTextResponse);
        });
    });
    (0, vitest_1.describe)('Schema Rewrite (discoverTools)', () => {
        (0, vitest_1.it)('TC-01: Should append _as_path to schema properties containing base64', async () => {
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
            global.fetch = vitest_1.vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ result: { tools: mockBackendTools } })
            });
            const schemaStr = await mockNode.testDiscoverTools('drawio');
            const rewrittenTools = JSON.parse(schemaStr);
            const props = rewrittenTools[0].inputSchema.properties;
            const required = rewrittenTools[0].inputSchema.required;
            (0, vitest_1.expect)(props.image_base64).toBeUndefined();
            (0, vitest_1.expect)(props.image_base64_as_path).toBeDefined();
            (0, vitest_1.expect)(props.image_base64_as_path.description).toContain('Proxy will convert to base64');
            (0, vitest_1.expect)(required).not.toContain('image_base64');
            (0, vitest_1.expect)(required).toContain('image_base64_as_path');
        });
    });
});
//# sourceMappingURL=mcp-bridge.test.js.map