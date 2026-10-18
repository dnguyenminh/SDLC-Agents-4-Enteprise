/**
 * WrapperServer body-limit tests (SA4E-363) — IT-BODY-01..04, 06, 07.
 *
 * The body cap is entirely a property of readBody + handleMcp response
 * handling, so everything is automatable at wrapper level with the SHARED
 * helpers (MockDeps / ephemeral port / postMcp / requestWithHeaders /
 * sendRawRequest — no duplication, see wrapper-server.helpers.ts and
 * wrapper-server.http.helpers.ts).
 * A small injected cap (1 KB / 4 KB) exercises byte-exact boundaries without
 * allocating 64 MB payloads (dev-analysis §7, JIRA AC-1/AC-2/AC-5/AC-7/AC-8).
 */
import { describe, it, expect } from 'vitest';
import {
  createTestServer, postMcp, MockDeps,
} from './wrapper-server.helpers';
import {
  requestWithHeaders, sendRawRequest,
} from './wrapper-server.http.helpers';
import {
  WrapperServer, DEFAULT_MAX_BODY_SIZE,
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

/** Start an ephemeral WrapperServer with an optional cap override; caller stops it. */
async function startWithCap(
  maxBodyBytes?: number,
): Promise<{ server: WrapperServer; deps: MockDeps; port: number }> {
  const { server, deps } = createTestServer(maxBodyBytes === undefined ? {} : { maxBodyBytes });
  await server.start(0);
  return { server, deps, port: server.listeningPort! };
}

describe('WrapperServer body limit (SA4E-363, IT-BODY-01..07)', () => {
  // IT-BODY-01 (dev-analysis §7): exact-cap body accepted — strict `>` on
  // cumulative HTTP body bytes; exactly at cap is NOT rejected (AC-5).
  it('IT-BODY-01: exact-cap body is accepted (strict > boundary)', async () => {
    const { server, port } = await startWithCap(1024);
    try {
      const res = await postMcp(port, pingBody(1024, 1));
      expect(res.status).toBe(200);
      expect(res.body.result).toEqual({});
      expect(res.body.error).toBeUndefined();
    } finally { await server.stop(); }
  });

  // IT-BODY-02: cap+1 rejected with the clean 413 JSON-RPC envelope (AC-2) —
  // HTTP 413 (not 400/500), id: null, static message, no tool reached.
  it('IT-BODY-02: cap+1 body → HTTP 413 + JSON-RPC envelope, no tool call', async () => {
    const { server, deps, port } = await startWithCap(1024);
    try {
      const res = await requestWithHeaders(port, {
        method: 'POST', path: '/mcp',
        headers: { 'Content-Type': 'application/json' },
        body: pingBody(1025, 1),
      });
      expect(res.status).toBe(413);
      expect(res.headers.connection?.toLowerCase()).toBe('close');
      expect(JSON.parse(res.body)).toEqual({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32600, message: expect.stringContaining('body too large') },
      });
      expect(deps.restCallToolMock.calls).toHaveLength(0);
    } finally { await server.stop(); }
  });

  // IT-BODY-03: the original bug regression — a 2 MB body now succeeds
  // (pre-fix: connection reset above 1 MB). Also pins the exported default.
  it('IT-BODY-03: 2 MB body succeeds on the default cap (original bug)', async () => {
    expect(DEFAULT_MAX_BODY_SIZE).toBe(64 * 1024 * 1024); // AC-1
    const { server, port } = await startWithCap();
    try {
      const res = await postMcp(port, pingBody(2 * 1024 * 1024, 1));
      expect(res.status).toBe(200);
      expect(res.body.result).toEqual({});
      expect(res.body.error).toBeUndefined();
    } finally { await server.stop(); }
  });

  // IT-BODY-04: Content-Length pre-check rejects an over-cap DECLARED body
  // before a single byte is read; the server stays healthy afterwards.
  it('IT-BODY-04: Content-Length pre-check → 413 before any byte is read', async () => {
    const { server, deps, port } = await startWithCap(1024);
    try {
      const raw = await sendRawRequest(port,
        'POST /mcp HTTP/1.1\r\n' +
        `Host: 127.0.0.1:${port}\r\n` +
        'Content-Type: application/json\r\n' +
        'Content-Length: 99999999\r\n' +
        '\r\n' +
        '{"jsonrpc":"2.0","id":1,"method":"ping"}');
      expect(raw.status).toBe(413);
      expect(raw.raw.toLowerCase()).toContain('connection: close');
      expect(raw.raw).toContain('-32600');
      expect(raw.raw).toContain('body too large');
      expect(deps.restCallToolMock.calls).toHaveLength(0);
      // Server still alive after rejecting the monster declaration (AC-7).
      const health = await requestWithHeaders(port, { method: 'GET', path: '/health' });
      expect(health.status).toBe(200);
    } finally { await server.stop(); }
  });

  // IT-BODY-06: cap injected via WrapperServerDeps.maxBodyBytes — the dep
  // wiring takes effect (4 KB cap: exactly-cap OK, cap+1 → 413) without
  // allocating 64 MB payloads (JIRA Proposed Fix §1/§4).
  it('IT-BODY-06: cap injected via deps (4 KB) — override is honored', async () => {
    const { server, deps, port } = await startWithCap(4 * 1024);
    try {
      const ok = await postMcp(port, pingBody(4 * 1024, 1));
      expect(ok.status).toBe(200);
      expect(ok.body.result).toEqual({});
      const over = await requestWithHeaders(port, {
        method: 'POST', path: '/mcp',
        headers: { 'Content-Type': 'application/json' },
        body: pingBody(4 * 1024 + 1, 2),
      });
      expect(over.status).toBe(413);
      expect(JSON.parse(over.body).error.code).toBe(-32600);
      // The 413 message reports the EFFECTIVE (injected) cap, not the default.
      expect(JSON.parse(over.body).error.message).toContain(`max ${4 * 1024} bytes`);
      expect(deps.restCallToolMock.calls).toHaveLength(0);
    } finally { await server.stop(); }
  });

  // IT-BODY-07: chunked body (no Content-Length) — NaN pre-check falls
  // through; the cumulative streaming check + bounded drain handle it
  // identically to Content-Length bodies (AC-8); server stays healthy.
  // Body 1600 bytes in 4×400 chunks: exceed at chunk 3, remainder 400 ≤ cap
  // → the bounded drain completes and the 413 is flushed (never a reset).
  it('IT-BODY-07: chunked oversized body → 413, server stays alive', async () => {
    const { server, port } = await startWithCap(1024);
    try {
      const payload = 'A'.repeat(1600);
      const chunkSize = 400;
      let framed = '';
      for (let i = 0; i < payload.length; i += chunkSize) {
        const piece = payload.slice(i, i + chunkSize);
        framed += `${piece.length.toString(16)}\r\n${piece}\r\n`;
      }
      framed += '0\r\n\r\n';
      const raw = await sendRawRequest(port,
        'POST /mcp HTTP/1.1\r\n' +
        `Host: 127.0.0.1:${port}\r\n` +
        'Content-Type: application/json\r\n' +
        'Transfer-Encoding: chunked\r\n' +
        '\r\n' +
        framed);
      expect(raw.status).toBe(413);
      expect(raw.raw.toLowerCase()).toContain('connection: close');
      expect(raw.raw).toContain('body too large');
      const health = await requestWithHeaders(port, { method: 'GET', path: '/health' });
      expect(health.status).toBe(200);
    } finally { await server.stop(); }
  });
});
