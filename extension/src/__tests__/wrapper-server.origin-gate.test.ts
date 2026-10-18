/**
 * SA4E-358 Origin Gate — integration matrix T1..T5 (STC IT-01..05, mức 2).
 * Real WrapperServer on a RANDOM port (G-7 — never hardcoded 9181) with a
 * capturing outputChannel for deny-log assertions.
 * (Split from wrapper-server.test.ts — origin-gate concern, T1..T5.)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startOriginGateSuite, OriginGateSuite } from './wrapper-server.origin-gate.helpers';
import {
  requestWithHeaders, assertNoAccessControlHeaders,
} from './wrapper-server.http.helpers';

describe('SA4E-358 Origin Gate (T1..T14)', () => {
  let suite: OriginGateSuite;
  let deps: OriginGateSuite['deps'];
  let port: number;
  let logLines: string[];
  let deniedLogs: OriginGateSuite['deniedLogs'];
  let expectDeniedLog: OriginGateSuite['expectDeniedLog'];
  let rpc: OriginGateSuite['rpc'];

  beforeAll(async () => {
    suite = await startOriginGateSuite();
    ({ deps, port, logLines, deniedLogs, expectDeniedLog, rpc } = suite);
  });

  afterAll(async () => {
    await suite.teardown();
  });

  beforeEach(() => {
    deps.restCallToolMock.calls = [];
    deps.restCallToolMock.result = { content: [{ type: 'text', text: '{}' }] };
  });

  // ── T1 / IT-01: POST /mcp evil Origin — full deny before handleMcp ──
  it('T1 (IT-01): POST /mcp Origin evil → 403 + zero CORS + tool NOT executed + deny log', async () => {
    const before = deniedLogs().length;
    const res = await requestWithHeaders(port, {
      method: 'POST', path: '/mcp',
      headers: { Origin: 'https://evil.com', Host: `127.0.0.1:${port}`, 'Content-Type': 'application/json' },
      body: rpc(1, 'tools/call', { name: 'mem_search', arguments: { query: 'x' } }),
    });
    expect(res.status).toBe(403);
    assertNoAccessControlHeaders(res.headers);
    expect(res.body).toBe('{"error":"Forbidden"}');
    expect(res.headers['content-type']).toContain('application/json');
    expect(deps.restCallToolMock.calls).toHaveLength(0); // deny BEFORE handleMcp (AC-1/BO-2)
    expectDeniedLog(1, 'origin-not-allowed', before);
  });

  // ── T2 / IT-02: preflight evil → 403 (NOT 204), no Allow-* (P6-16 closed) ──
  it('T2 (IT-02): OPTIONS preflight evil → 403 + zero access-control headers', async () => {
    const before = deniedLogs().length;
    const res = await requestWithHeaders(port, {
      method: 'OPTIONS', path: '/mcp',
      headers: {
        Origin: 'https://evil.com', Host: `127.0.0.1:${port}`,
        'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'Content-Type',
      },
    });
    expect(res.status).toBe(403);
    assertNoAccessControlHeaders(res.headers); // includes Allow-Method*/Allow-Headers
    expect(res.body).toBe('{"error":"Forbidden"}');
    expectDeniedLog(1, 'origin-not-allowed', before);
  });

  // ── T3 / IT-03: native no-Origin session — pass-through, zero regression ──
  it('T3 (IT-03): full native session (no Origin) → current behavior + zero CORS (AC-4)', async () => {
    const before = deniedLogs().length;
    const session = async (body: string) => {
      const res = await requestWithHeaders(port, {
        method: 'POST', path: '/mcp',
        headers: { Host: `127.0.0.1:${port}`, 'Content-Type': 'application/json' },
        body,
      });
      // requestWithHeaders returns the RAW body string (helper spec) — 202 has
      // an empty body; parse only when present.
      return { ...res, body: res.body ? JSON.parse(res.body) : res.body };
    };
    const init = await session(rpc(20, 'initialize', { protocolVersion: '2024-11-05', capabilities: {} }));
    expect(init.status).toBe(200);
    expect(init.body.result.protocolVersion).toBe('2024-11-05');
    assertNoAccessControlHeaders(init.headers); // zero CORS for native (G-5, no ACAO assert)

    const notif = await session(rpc(0, 'notifications/initialized'));
    expect(notif.status).toBe(202);
    assertNoAccessControlHeaders(notif.headers);

    const list = await session(rpc(21, 'tools/list', {}));
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body.result.tools)).toBe(true);
    assertNoAccessControlHeaders(list.headers);

    for (let i = 0; i < 3; i++) {
      const call = await session(rpc(22 + i, 'tools/call', { name: 'mem_search', arguments: { query: `q${i}` } }));
      expect(call.status).toBe(200);
      assertNoAccessControlHeaders(call.headers);
    }
    expect(deps.restCallToolMock.calls).toHaveLength(3); // tools execute normally (UT-33 counterpart)
    expect(deniedLogs().length).toBe(before); // allowed session → NO new deny line (FSD §7.3)
  });

  // ── T4 / IT-04: preflight webview → 204 + echo EXACT + Allow-* + Vary ──
  it('T4 (IT-04): OPTIONS webview → 204 + ACAO echo EXACT + Allow-* + Vary: Origin', async () => {
    const res = await requestWithHeaders(port, {
      method: 'OPTIONS', path: '/mcp',
      headers: { Origin: 'vscode-webview://abc123', Host: `127.0.0.1:${port}` },
    });
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('vscode-webview://abc123'); // RAW echo (G-4)
    expect(res.headers['access-control-allow-methods']).toBe('GET, POST, OPTIONS');
    expect(res.headers['access-control-allow-headers']).toBe('Content-Type');
    expect(res.headers['vary']).toBe('Origin'); // SEC-358-03 (assert mềm per STC — implemented)
    for (const [k, v] of Object.entries(res.headers)) {
      if (k.startsWith('access-control-')) expect(String(v)).not.toContain('*'); // BR-07
    }
  });

  // ── T5 / IT-05: localhost origin → pass + echo + tool executes ──
  it('T5 (IT-05): POST localhost origin → 200 + echo + tool executes (origin port ≠ listen)', async () => {
    const res = await requestWithHeaders(port, {
      method: 'POST', path: '/mcp',
      headers: { Origin: 'http://localhost:3000', Host: `localhost:${port}`, 'Content-Type': 'application/json' },
      body: rpc(30, 'tools/call', { name: 'mem_search', arguments: { query: 'x' } }),
    });
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(deps.restCallToolMock.calls).toHaveLength(1);

    const variant = await requestWithHeaders(port, {
      method: 'POST', path: '/mcp',
      headers: { Origin: 'http://127.0.0.1:5173', Host: `127.0.0.1:${port}`, 'Content-Type': 'application/json' },
      body: rpc(31, 'tools/call', { name: 'mem_search', arguments: { query: 'y' } }),
    });
    expect(variant.status).toBe(200);
    expect(variant.headers['access-control-allow-origin']).toBe('http://127.0.0.1:5173');
  });
});
