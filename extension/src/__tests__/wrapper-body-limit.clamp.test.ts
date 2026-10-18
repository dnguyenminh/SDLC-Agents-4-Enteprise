/**
 * WrapperServer body-limit tests (SA4E-363) — IT-BODY-05 (keep-alive recovery)
 * + the mcpMaxBodyBytes setting clamp UT (SA4E-363 §4 / security Q3).
 */
import { describe, it, expect } from 'vitest';
import * as http from 'http';
import { createTestServer } from './wrapper-server.helpers';
import {
  WrapperServer, DEFAULT_MAX_BODY_SIZE,
  MIN_MCP_MAX_BODY_BYTES, MAX_MCP_MAX_BODY_BYTES, resolveMcpMaxBodyBytes,
} from '../services/WrapperServer';

/** Exact-size JSON-RPC ping body — all ASCII, so Buffer.byteLength === length.
 *  Pads params.pad with 'A' to hit the target byte count precisely: replacing
 *  the 2-char empty string `""` with `"<pad A's>"` grows the body by exactly
 *  `pad` chars, hence pad = target − minimal.length. */
function pingBody(targetBytes: number, id: number): string {
  const minimal = JSON.stringify({ jsonrpc: '2.0', id, method: 'ping', params: { pad: '' } });
  const pad = targetBytes - minimal.length;
  if (pad < 0) throw new Error(`ping body cannot be smaller than ${minimal.length} bytes`);
  return JSON.stringify({ jsonrpc: '2.0', id, method: 'ping', params: { pad: 'A'.repeat(pad) } });
}

/** postMcp equivalent routed through a caller-supplied agent (keep-alive reuse). */
function postWithAgent(
  port: number, agent: http.Agent, body: string,
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: any }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path: '/mcp', method: 'POST', agent,
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf-8');
          const headers = res.headers;
          try { resolve({ status: res.statusCode!, headers, body: JSON.parse(text) }); }
          catch { resolve({ status: res.statusCode!, headers, body: text }); }
        });
      },
    );
    req.on('error', reject);
    req.end(body);
  });
}

/** Fake settings getter backing the resolveMcpMaxBodyBytes UTs. */
function fakeSettings(value: unknown): { get: <T>(section: string, defaultValue: T) => T } {
  return { get: (_section: string, defaultValue: unknown) => (value === undefined ? defaultValue : value) as any };
}

describe('WrapperServer body limit (SA4E-363, IT-BODY-01..07)', () => {
  // IT-BODY-05: the 413 carries Connection: close and does not poison a
  // keep-alive agent — a follow-up ping on the SAME agent succeeds on a fresh
  // connection (AC-7, no keep-alive reuse of a socket with consumed body).
  it('IT-BODY-05: 413 closes the connection; keep-alive agent recovers', async () => {
    const { server } = createTestServer({ maxBodyBytes: 1024 });
    await server.start(0);
    const port = server.listeningPort!;
    const agent = new http.Agent({ keepAlive: true });
    try {
      const over = await postWithAgent(port, agent, pingBody(2048, 1));
      expect(over.status).toBe(413);
      expect(over.headers.connection?.toLowerCase()).toBe('close');
      const after = await postWithAgent(port, agent, pingBody(64, 2));
      expect(after.status).toBe(200);
      expect(after.body.result).toEqual({});
    } finally {
      agent.destroy();
      await server.stop();
    }
  });
});

// ── SA4E-363 §4 / security Q3 — mcpMaxBodyBytes clamp (UT) ──────────────────
describe('resolveMcpMaxBodyBytes clamp (SA4E-363 §4)', () => {
  it('UT: in-range value passes through', () => {
    expect(resolveMcpMaxBodyBytes(fakeSettings(8 * 1024 * 1024))).toBe(8 * 1024 * 1024);
  });

  it('UT: value below 1 MiB clamps up to 1 MiB', () => {
    expect(resolveMcpMaxBodyBytes(fakeSettings(500 * 1024))).toBe(MIN_MCP_MAX_BODY_BYTES);
    expect(resolveMcpMaxBodyBytes(fakeSettings(1024))).toBe(MIN_MCP_MAX_BODY_BYTES);
  });

  it('UT: value above 100 MiB clamps down to 100 MiB (backend ingress cap)', () => {
    expect(resolveMcpMaxBodyBytes(fakeSettings(2 ** 31))).toBe(MAX_MCP_MAX_BODY_BYTES);
    expect(resolveMcpMaxBodyBytes(fakeSettings(MAX_MCP_MAX_BODY_BYTES + 1))).toBe(MAX_MCP_MAX_BODY_BYTES);
  });

  it('UT: invalid types (string / NaN / non-integer) → default 64 MiB', () => {
    expect(resolveMcpMaxBodyBytes(fakeSettings('64'))).toBe(DEFAULT_MAX_BODY_SIZE);
    expect(resolveMcpMaxBodyBytes(fakeSettings(Number.NaN))).toBe(DEFAULT_MAX_BODY_SIZE);
    expect(resolveMcpMaxBodyBytes(fakeSettings(64.5))).toBe(DEFAULT_MAX_BODY_SIZE);
  });

  it('UT: 0 / negative → default 64 MiB (never disables the cap)', () => {
    expect(resolveMcpMaxBodyBytes(fakeSettings(0))).toBe(DEFAULT_MAX_BODY_SIZE);
    expect(resolveMcpMaxBodyBytes(fakeSettings(-1))).toBe(DEFAULT_MAX_BODY_SIZE);
  });

  it('UT: setting absent → default 64 MiB', () => {
    expect(resolveMcpMaxBodyBytes(fakeSettings(undefined))).toBe(DEFAULT_MAX_BODY_SIZE);
  });
});
