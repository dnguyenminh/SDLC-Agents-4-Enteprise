/**
 * SA4E-358 raw-socket / header-level test helpers (TDD §11.5.1).
 * Split out of wrapper-server.helpers.ts so each helper file stays ≤200 lines.
 */
import * as http from 'http';
import * as net from 'net';

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
