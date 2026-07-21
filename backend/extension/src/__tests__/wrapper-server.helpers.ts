/**
 * Test helpers for WrapperServer integration tests.
 * Provides mock deps, HTTP request utility, and shared fixtures.
 */
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { WrapperServer, WrapperServerDeps } from '../services/WrapperServer';
import { Base64ProxyService } from '../services/Base64ProxyService';

export const TMP_DIR = path.join(__dirname, '.tmp-wrapper-server');

/** Minimal mock for vscode.OutputChannel */
export function createMockOutputChannel() {
  return { appendLine: () => {} } as any;
}

/** Standard tool schemas for tests */
export const TOOL_SCHEMAS = [
  {
    name: 'drawio_export_png',
    description: 'Export drawio to PNG. Returns output_base64 field.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string' },
        content_base64: { type: 'string', description: 'Base64 file content' },
      },
      required: ['content_base64'],
    },
  },
  {
    name: 'mem_search',
    description: 'Search memory for entries.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
  },
];

export interface MockDeps extends WrapperServerDeps {
  restGetToolsMock: { tools: typeof TOOL_SCHEMAS };
  restCallToolMock: { calls: Array<{ name: string; args: any }>; result: any };
}

/** Create WrapperServer with mocked deps */
export function createTestServer(overrides?: Partial<MockDeps>): { server: WrapperServer; deps: MockDeps } {
  const restGetToolsMock = { tools: [...TOOL_SCHEMAS] };
  const restCallToolMock = { calls: [] as Array<{ name: string; args: any }>, result: {} as any };

  const base64Proxy = new Base64ProxyService();
  const deps: MockDeps = {
    outputChannel: createMockOutputChannel(),
    base64Proxy,
    restGetTools: async () => restGetToolsMock.tools,
    restCallTool: async (name: string, args: Record<string, unknown>) => {
      restCallToolMock.calls.push({ name, args });
      return restCallToolMock.result;
    },
    restGetToolsMock,
    restCallToolMock,
    ...overrides,
  } as any;

  const server = new WrapperServer(deps);
  return { server, deps };
}

/** Send a JSON-RPC request to the server */
export function postMcp(port: number, body: unknown): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const data = typeof body === 'string' ? body : JSON.stringify(body);
    const req = http.request(
      { hostname: '127.0.0.1', port, path: '/mcp', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf-8');
          try { resolve({ status: res.statusCode!, body: JSON.parse(text) }); }
          catch { resolve({ status: res.statusCode!, body: text }); }
        });
      },
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

/** Send raw bytes to the server (for oversized body test) */
export function postRaw(port: number, data: Buffer): Promise<{ status: number | null; error?: string }> {
  return new Promise((resolve) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path: '/mcp', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': data.length } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode }));
      },
    );
    req.on('error', (err) => resolve({ status: null, error: err.message }));
    req.write(data);
    req.end();
  });
}

/**
 * Open the GET /mcp SSE channel and resolve on the first event.
 * Closes the request after the first `event: message` frame.
 */
export function openSse(port: number, timeoutMs = 3000): Promise<{ status: number; contentType: string; chunk: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path: '/mcp', method: 'GET', timeout: timeoutMs },
      (res) => {
        let data = '';
        res.on('data', (c: Buffer) => {
          data += c.toString('utf-8');
          if (data.includes('event: message')) {
            resolve({ status: res.statusCode!, contentType: res.headers['content-type'] || '', chunk: data });
            req.destroy();
          }
        });
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.end();
  });
}

export function ensureTmpDir(): void {
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
}

export function cleanTmpDir(): void {
  if (fs.existsSync(TMP_DIR)) fs.rmSync(TMP_DIR, { recursive: true, force: true });
}
