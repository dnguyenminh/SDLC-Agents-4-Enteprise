/**
 * Test helpers for WrapperServer integration tests.
 * Provides mock deps, HTTP request utility, and shared fixtures.
 *
 * NOTE: Raw http.request() is intentional here — this is the TEST CLIENT
 * that exercises the WrapperServer from the outside. Using the production
 * httpPostJson/httpGetJson utilities would mask real integration issues.
 * Test clients need fine-grained control over headers and raw bytes.
 */
import * as http from 'http';
import * as net from 'net';
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

  // Workspace root = TMP_DIR so relative file_path args resolve inside it
  // (mirrors RemoteBackendClient wiring the real workspace folder — D2 fix).
  const base64Proxy = new Base64ProxyService(TMP_DIR);
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

/** Send a JSON-RPC request to the server — raw http.request intentional (test client) */
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

/** Send raw bytes to the server (for oversized body test) — raw intentional */
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
 * Raw http.request intentional — SSE streaming requires direct socket control.
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

// ── SA4E-358 helpers (TDD §11.5.1 — requestWithHeaders, assertNoAccessControl
//    Headers, sendRawRequest, createCapturingOutputChannel) ───────────────────

/**
 * HTTP request with FULLY caller-controlled headers (Origin, Host, ACAM…).
 * Unlike postMcp(), nothing is auto-added except Content-Length when a body is
 * present — preflight requests stay bare when the caller omits ACAM (T13).
 * With `closeOnFirstData`, resolves as soon as response headers + first chunk
 * arrive (SSE streams never end — T11 webview GET /mcp branch).
 */
export function requestWithHeaders(
  port: number,
  opts: { method: string; path?: string; headers?: Record<string, string>; body?: string; closeOnFirstData?: boolean },
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const data = opts.body;
    const headers: Record<string, string | number> = { ...opts.headers };
    if (data !== undefined) headers['Content-Length'] = Buffer.byteLength(data);
    const req = http.request(
      { host: '127.0.0.1', port, path: opts.path ?? '/', method: opts.method, headers },
      (res) => {
        const chunks: Buffer[] = [];
        const finish = () => {
          resolve({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks).toString('utf-8') });
        };
        res.on('data', (c: Buffer) => {
          chunks.push(c);
          if (opts.closeOnFirstData) { req.destroy(); finish(); }
        });
        res.on('end', finish);
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    if (data !== undefined) req.write(data);
    req.end();
  });
}

/** Assert NO response header key starts with access-control- (I-2/AC-8, G-5). */
export function assertNoAccessControlHeaders(headers: http.IncomingHttpHeaders): void {
  const violations = Object.keys(headers).filter((k) => k.toLowerCase().startsWith('access-control-'));
  if (violations.length > 0) {
    throw new Error(
      `Access-Control headers leaked on a response that must carry none: [${violations.join(', ')}]`,
    );
  }
}

/**
 * Raw socket HTTP/1.x request — the ONLY way to send duplicate headers, no
 * Host at all, or CRLF quirks (client http.request cannot). Resolves with the
 * parsed status line + full raw response text on socket close/timeout.
 */
export function sendRawRequest(
  port: number,
  rawBytes: string,
  timeoutMs = 2000,
): Promise<{ status: number | null; raw: string }> {
  return new Promise((resolve) => {
    let data = '';
    let status: number | null = null;
    let done = false;
    const socket = net.connect({ host: '127.0.0.1', port }, () => socket.write(rawBytes));
    const finish = () => {
      if (done) return;
      done = true;
      try { socket.destroy(); } catch { /* already gone */ }
      resolve({ status, raw: data });
    };
    socket.on('data', (c: Buffer) => {
      data += c.toString('utf-8');
      if (status === null) {
        const m = /HTTP\/1\.[01] (\d{3})/.exec(data);
        if (m) status = parseInt(m[1], 10);
      }
    });
    socket.on('close', finish);
    socket.on('error', finish);
    socket.setTimeout(timeoutMs, finish);
  });
}

/** Mock outputChannel that CAPTURES appendLine calls (deny-log assertions, T9). */
export function createCapturingOutputChannel(): { appendLine: (line: string) => void; lines: string[] } {
  const lines: string[] = [];
  return { appendLine: (line: string) => { lines.push(line); }, lines };
}
