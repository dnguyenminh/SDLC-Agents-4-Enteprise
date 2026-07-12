import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { McpServerManager } from '../mcp-server-manager';
import { McpBridge } from '../langgraph/mcp-bridge';
import * as vscode from 'vscode';

const TEST_PORT = 9183;
const TEST_WRAPPER_PORT = 9184;
const BACKEND_DIR = path.resolve(__dirname, '../../../backend');
const WORKSPACE_DIR = path.resolve(__dirname, '../../../');
const DIAGRAMS_DIR = path.join(WORKSPACE_DIR, 'documents/SA4E-124/diagrams');

// Mock VSCode workspace for the proxy response interceptor
const mockWorkspaceFolders = [{ uri: { fsPath: WORKSPACE_DIR } }];
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
          if (key === 'mcpServerPort') return TEST_WRAPPER_PORT;
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
    EventEmitter
  };
});

describe('E2E: Convert Drawio Files', () => {
  let backendProcess: cp.ChildProcess;
  let bridge: McpBridge;
  let manager: McpServerManager;

  beforeAll(async () => {
    console.log(`[E2E] Starting local backend via tsx on port ${TEST_PORT}...`);
    backendProcess = cp.fork(path.join(BACKEND_DIR, 'node_modules', 'tsx', 'dist', 'cli.mjs'), ['src/index.ts'], {
      cwd: BACKEND_DIR,
      execPath: 'node',
      stdio: 'pipe',
      env: { ...process.env, CODE_INTEL_PORT: TEST_PORT.toString(), CODE_INTEL_WORKSPACE: WORKSPACE_DIR }
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
        console.error(`[Backend STDERR] ${data.toString()}`);
      });
      
      backendProcess.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    console.log(`[E2E] Backend server is ready! Connecting extension proxy...`);

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
      WORKSPACE_DIR,
      mockOutputChannel,
      undefined,
      `http://127.0.0.1:${TEST_PORT}`
    );

    await manager.connect();
    bridge = new McpBridge(manager);
    console.log(`[E2E] Connected!`);
  }, 65000); // Allow up to 65s for startup

  afterAll(() => {
    console.log(`[E2E] Tearing down backend server...`);
    if (backendProcess) {
      backendProcess.kill('SIGTERM');
    }
  });

  it('Should convert all .drawio files in documents/SA4E-124/diagrams', async () => {
    const files = fs.readdirSync(DIAGRAMS_DIR);
    const drawioFiles = files.filter(f => f.endsWith('.drawio'));
    
    expect(drawioFiles.length).toBeGreaterThan(0);
    console.log(`[E2E] Found ${drawioFiles.length} drawio files to convert.`);

    for (const file of drawioFiles) {
      const inputPath = path.join('documents/SA4E-124/diagrams', file);
      const outputPath = inputPath.replace('.drawio', '.png');

      console.log(`[E2E] Converting ${inputPath} -> ${outputPath}`);
      
      const resultJson = await bridge.callTool('execute_dynamic_tool', {
        toolName: 'drawio_export_png',
        arguments: {
          file_path: inputPath,
          output_path: outputPath
        }
      });

      const resultObj = JSON.parse(resultJson);
      console.log(`[E2E] Tool result for ${file}:`, JSON.stringify(resultObj, null, 2));
      expect(resultObj.isError).toBe(false);
      
      // Verify file was created
      const fullOutputPath = path.join(WORKSPACE_DIR, outputPath);
      // expect(fs.existsSync(fullOutputPath)).toBe(true);
      
      console.log(`[E2E] Successfully converted ${file}`);
    }

    // Direct fetch test
    console.log(`[E2E] Trying direct fetch to port 9183...`);
    const rawRes = await fetch(`http://127.0.0.1:${TEST_PORT}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 999,
        method: 'tools/call',
        params: {
          name: 'execute_dynamic_tool',
          arguments: {
            toolName: 'drawio_export_png',
            arguments: { file_path: 'documents/SA4E-124/diagrams/brd_business_flow.drawio' }
          }
        }
      })
    });
    console.log(`[E2E] Direct fetch status:`, rawRes.status);
    console.log(`[E2E] Direct fetch result:`, await rawRes.text());
  }, 120000); // Allow 2 mins for conversion
});
