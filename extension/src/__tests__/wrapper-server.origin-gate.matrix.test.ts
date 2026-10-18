/**
 * SA4E-358 Origin Gate — integration matrix T10..T12 (STC IT-10..12, mức 2).
 * Malformed origins, zero-CORS sweep across routes, raw-socket duplicates.
 * (Split from wrapper-server.test.ts — origin-gate concern, T10..T12.)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startOriginGateSuite, OriginGateSuite } from './wrapper-server.origin-gate.helpers';
import {
  requestWithHeaders, assertNoAccessControlHeaders, sendRawRequest,
} from './wrapper-server.http.helpers';

describe('SA4E-358 Origin Gate (T1..T14)', () => {
  let suite: OriginGateSuite;
  let deps: OriginGateSuite['deps'];
  let port: number;
  let deniedLogs: OriginGateSuite['deniedLogs'];
  let expectDeniedLog: OriginGateSuite['expectDeniedLog'];
  let rpc: OriginGateSuite['rpc'];

  beforeAll(async () => {
    suite = await startOriginGateSuite();
    ({ deps, port, deniedLogs, expectDeniedLog, rpc } = suite);
  });

  afterAll(async () => {
    await suite.teardown();
  });

  beforeEach(() => {
    deps.restCallToolMock.calls = [];
    deps.restCallToolMock.result = { content: [{ type: 'text', text: '{}' }] };
  });

  // ── T10 / IT-10: malformed matrix — fail-closed, server never crashes ──
  it('T10 (IT-10): malformed origins → 403 malformed-origin; whitespace passes; server alive', async () => {
    const post = (origin?: string) => requestWithHeaders(port, {
      method: 'POST', path: '/mcp',
      headers: {
        Host: `127.0.0.1:${port}`, 'Content-Type': 'application/json',
        ...(origin === undefined ? {} : { Origin: origin }),
      },
      body: rpc(60, 'ping'),
    });

    const cases: Array<[string, boolean]> = [
      ['%%', true], ['http://a.com,http://b.com', true], ['localhost:3000', true],
    ];
    for (const [origin, deny] of cases) {
      const before = deniedLogs().length;
      const res = await post(origin);
      expect(res.status, `origin=${origin}`).toBe(deny ? 403 : 200);
      if (deny) {
        expect(res.body).toBe('{"error":"Forbidden"}');
        assertNoAccessControlHeaders(res.headers);
        expectDeniedLog(1, 'malformed-origin', before);
      }
    }

    // Whitespace-only Origin = absent after trim → no-Origin branch (NOT 403)
    const ws = await post('   ');
    expect(ws.status).toBe(200);
    assertNoAccessControlHeaders(ws.headers);

    // Duplicate Origin via raw socket — deny even though 1 value is valid
    const raw = await sendRawRequest(port,
      `POST /mcp HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nOrigin: vscode-webview://abc\r\nOrigin: https://evil.com\r\nContent-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}`);
    expect(raw.status).toBe(403);
    expect(raw.raw).toContain('Forbidden');

    // Server alive — next request processed (FR-12 / reliability)
    const health = await requestWithHeaders(port, { method: 'GET', path: '/health', headers: { Host: `127.0.0.1:${port}` } });
    expect(health.status).toBe(200);
    expect(JSON.parse(health.body)).toEqual({ status: 'ok', mode: 'wrapper' });
  });

  // ── T11 / IT-11: zero-CORS sweep — 5 routes × 3 branches = 15 responses ──
  it('T11 (IT-11): G-5 sweep — 15/15 responses match the no-CORS/echo matrix', async () => {
    const routes = [
      { method: 'GET', path: '/health', sse: false },
      { method: 'GET', path: '/mcp', sse: true },
      { method: 'POST', path: '/mcp', sse: false },
      { method: 'OPTIONS', path: '/mcp', sse: false },
      { method: 'GET', path: '/nonexistent', sse: false },
    ];
    const acKeys = (h: Record<string, unknown>) => Object.keys(h).filter((k) => k.startsWith('access-control-'));
    const send = (r: typeof routes[number], origin?: string) => requestWithHeaders(port, {
      method: r.method, path: r.path, closeOnFirstData: r.sse,
      headers: {
        Host: `127.0.0.1:${port}`,
        ...(r.method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
        ...(origin === undefined ? {} : { Origin: origin }),
      },
      body: r.method === 'POST' ? rpc(70, 'ping') : undefined,
    });

    for (const r of routes) {
      // evil → 403 + zero CORS on EVERY route (uniform — AD-3, AC-8)
      const evil = await send(r, 'https://evil.com');
      expect(evil.status, `evil ${r.method} ${r.path}`).toBe(403);
      expect(acKeys(evil.headers)).toHaveLength(0);

      // webview → ACAO echo on EVERY status (200/204/404 — G-5 uniform)
      const web = await send(r, 'vscode-webview://abc123');
      expect(web.headers['access-control-allow-origin']).toBe('vscode-webview://abc123');
      expect(acKeys(web.headers).length).toBeGreaterThanOrEqual(1);

      // no-Origin → zero CORS + current behavior (no ACAO assert — native)
      const native = await send(r);
      expect(acKeys(native.headers)).toHaveLength(0);
      const expected = r.path === '/nonexistent' ? 404 : r.method === 'OPTIONS' ? 204 : 200;
      expect(native.status, `native ${r.method} ${r.path}`).toBe(expected);
    }
  });

  // ── T12 / IT-12: raw-socket duplicates + no-Origin Host-evil (SEC-358-01) ──
  it('T12 (IT-12): raw socket — duplicate Origin/Host, lowercase key, no-Origin Host-evil', async () => {
    const rawPost = (headers: string, body = '{}') => sendRawRequest(port,
      `POST /mcp HTTP/1.1\r\n${headers}Content-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`);

    // 1) duplicate Origin → malformed-origin (NO first-wins — C-3/I-4)
    let before = deniedLogs().length;
    let raw = await rawPost(`Host: 127.0.0.1:${port}\r\nOrigin: vscode-webview://abc\r\nOrigin: https://evil.com\r\n`);
    expect(raw.status).toBe(403);
    expect(raw.raw).not.toMatch(/access-control-/i);
    expectDeniedLog(1, 'malformed-origin', before);

    // 2) duplicate Host → host-mismatch (smuggling fail-closed)
    before = deniedLogs().length;
    raw = await rawPost(`Host: 127.0.0.1:${port}\r\nHost: evil.com:${port}\r\nOrigin: vscode-webview://abc\r\n`);
    expect(raw.status).toBe(403);
    expectDeniedLog(1, 'host-mismatch', before);

    // 3) lowercase `origin:` key — still detected (case-insensitive keys)
    before = deniedLogs().length;
    raw = await rawPost(`Host: 127.0.0.1:${port}\r\norigin: https://evil.com\r\n`);
    expect(raw.status).toBe(403);
    expectDeniedLog(1, 'origin-not-allowed', before);

    // 4) SEC-358-01 / I-8 — raw request WITHOUT Origin + Host attacker.com
    before = deniedLogs().length;
    raw = await rawPost(`Host: attacker.com:${port}\r\n`);
    expect(raw.status).toBe(403);
    expect(raw.raw).toContain('Forbidden');
    expectDeniedLog(1, 'host-mismatch', before);

    expect(deps.restCallToolMock.calls).toHaveLength(0);
  });
});
