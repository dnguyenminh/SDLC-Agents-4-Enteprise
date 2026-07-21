import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { McpServerManager } from '../mcp-server-manager';
import { McpBridge } from '../langgraph/core/mcp-bridge';
import * as vscode from 'vscode';

// Mock VSCode workspace for the proxy response interceptor
const mockWorkspaceFolders = [{ uri: { fsPath: path.join(__dirname, '.tmp-cross-e2e') } }];
vi.mock('vscode', () => {
  class EventEmitter {
    event = vi.fn();
    fire = vi.fn();
    dispose = vi.fn();
  }
  return {
    workspace: {
      get workspaceFolders() {
        return mockWorkspaceFolders;
      },
      getConfiguration: vi.fn(() => ({
        get: vi.fn((key) => {
          if (key === 'mcpServerPort') return TEST_PORT;
          return null;
        })
      }))
    },
    window: {
      createOutputChannel: vi.fn(() => ({
        appendLine: vi.fn(),
        show: vi.fn(),
        dispose: vi.fn()
      }))
    },
    EventEmitter,
    TreeItem: class {
      label: string;
      collapsibleState: number;
      constructor(label: string, collapsibleState = 0) {
        this.label = label;
        this.collapsibleState = collapsibleState;
      }
    },
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  };
});

const TEST_PORT = 9182;
const BACKEND_DIR = path.resolve(__dirname, '../../../backend');
const TMP_DIR = path.join(__dirname, '.tmp-cross-e2e');

describe('Cross-Process E2E: Extension <-> Backend', () => {
  let backendProcess: cp.ChildProcess;
  let bridge: McpBridge;
  let manager: McpServerManager;

  beforeAll(async () => {
    // Setup tmp dir
    if (fs.existsSync(TMP_DIR)) {
      fs.rmSync(TMP_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TMP_DIR, { recursive: true });

    backendProcess = cp.fork(path.join(BACKEND_DIR, 'node_modules', 'tsx', 'dist', 'cli.mjs'), ['src/index.ts'], {
      cwd: BACKEND_DIR,
      execPath: 'node',
      stdio: 'pipe',
      env: { ...process.env, CODE_INTEL_PORT: TEST_PORT.toString() }
    });

    // Wait for the backend to log "Backend MCP Server ready"
    await new Promise<void>((resolve, reject) => {
      let isReady = false;
      const timeout = setTimeout(() => {
        if (!isReady) {
          backendProcess.kill('SIGKILL');
          reject(new Error('Backend server failed to start within 60 seconds.'));
        }
      }, 60000);

      let buffer = '';
      backendProcess.stdout?.on('data', (data) => {
        buffer += data.toString();
        if (buffer.includes('Backend MCP Server ready')) {
          isReady = true;
          clearTimeout(timeout);
          resolve();
        }
      });

      backendProcess.stderr?.on('data', (data) => {
        // console.error(`[Backend STDERR] ${data.toString()}`);
      });
      
      backendProcess.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    console.log(`[E2E] Backend server is ready!`);

    // Setup Extension-side classes to connect to the backend
    const mockOutputChannel = {
      name: 'MockChannel',
      append: vi.fn(),
      appendLine: vi.fn(),
      clear: vi.fn(),
      show: vi.fn(),
      hide: vi.fn(),
      dispose: vi.fn(),
      replace: vi.fn()
    } as unknown as vscode.OutputChannel;

    manager = new McpServerManager(
      TMP_DIR, // workspaceFolder
      mockOutputChannel,
      undefined, // authManager
      `http://127.0.0.1:${TEST_PORT}` // backendUrl
    );

    await manager.connect();
    bridge = new McpBridge(manager);
  }, 65000); // Allow up to 65s for startup

  afterAll(() => {
    console.log(`[E2E] Tearing down backend server...`);
    if (backendProcess) {
      backendProcess.kill('SIGTERM'); // Graceful shutdown
    }
    if (fs.existsSync(TMP_DIR)) {
      fs.rmSync(TMP_DIR, { recursive: true, force: true });
    }
  });

  it('TC-E2E-01: Should connect to backend via listTools and fetch real tool definitions', async () => {
    const tools = await bridge.listTools();
    expect(tools.length).toBeGreaterThan(0);
    
    // Verify that utility tools (agent_log) exist from the backend UtilityModule
    console.log('[E2E] Tools from backend:', tools.map(t => t.name).join(', '));
    const streamWriteFileTool = tools.find(t => t.name === 'stream_write_file');
    expect(streamWriteFileTool).toBeDefined();
    expect(streamWriteFileTool?.description).toContain('Write');
  });

  it('TC-E2E-02: Should convert local file to Base64, send to Backend, and get Backend response', async () => {
    // 1. Create a local file in Extension scope
    const filePath = path.join(TMP_DIR, 'hello.txt');
    fs.writeFileSync(filePath, 'Hello from Cross-Process E2E', 'utf-8');

    // 2. Call the tool via McpBridge (with _as_path)
    // The bridge will convert `message_as_path` -> read file -> encode to Base64 -> send as `message`
    // The backend UtilityModule's agent_log tool takes `message` and returns `Logged: <message>`
    const resultJson = await bridge.callTool('agent_log', {
      message_as_path: filePath
    });

    // 3. Verify the result
    const resultObj = JSON.parse(resultJson);
    expect(resultObj.isError).toBe(false);
    
    // The text should contain the Base64 representation of "Hello from Cross-Process E2E"
    const expectedBase64 = Buffer.from('Hello from Cross-Process E2E', 'utf-8').toString('base64');
    expect(resultObj.content[0].text).toContain(`Logged: ${expectedBase64}`);
  });
});
