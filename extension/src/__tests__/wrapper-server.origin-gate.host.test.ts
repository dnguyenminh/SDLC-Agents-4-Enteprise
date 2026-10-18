/**
 * SA4E-358 Origin Gate — integration matrix T6..T9 (STC IT-06..09, mức 2).
 * Host rebinding/variants, SSE deny, bind address, CRLF/log-forging defense.
 * (Split from wrapper-server.test.ts — origin-gate concern, T6..T9.)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startOriginGateSuite, OriginGateSuite } from './wrapper-server.origin-gate.helpers';
import {
  requestWithHeaders, assertNoAccessControlHeaders, sendRawRequest,
} from './wrapper-server.http.helpers';
import { openSse } from './wrapper-server.helpers';

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

  // ── T6 / IT-06: Host variants with Origin — rebinding blocked + precedence ──
  it('T6 (IT-06): Host evil/port+1/missing/[::1] → 403 host-mismatch; both-fail precedence', async () => {
    const WEBVIEW = 'vscode-webview://abc';
    const post = (origin: string, host: string) => requestWithHeaders(port, {
      method: 'POST', path: '/mcp',
      headers: { Origin: origin, Host: host, 'Content-Type': 'application/json' },
      body: rpc(40, 'tools/call', { name: 'mem_search', arguments: {} }),
    });

    // 1) Host attacker.com
    let before = deniedLogs().length;
    let res = await post(WEBVIEW, `attacker.com:${port}`);
    expect(res.status).toBe(403);
    assertNoAccessControlHeaders(res.headers);
    expectDeniedLog(1, 'host-mismatch', before);

    // 2) Host port+1 (exact listen port — G-7 random port proves no hardcode)
    before = deniedLogs().length;
    res = await post(WEBVIEW, `127.0.0.1:${port + 1}`);
    expect(res.status).toBe(403);
    expectDeniedLog(1, 'host-mismatch', before);

    // 3) NO Host at all (HTTP/1.0-style + Origin) — raw socket: http.request
    //    always auto-adds Host (STC IT-06 step 3 note)
    before = deniedLogs().length;
    const raw = await sendRawRequest(port, `POST /mcp HTTP/1.0\r\nOrigin: ${WEBVIEW}\r\nConnection: close\r\n\r\n`);
    expect(raw.status).toBe(403);
    expect(raw.raw).not.toMatch(/access-control-/i);
    expectDeniedLog(1, 'host-mismatch', before);

    // 4) Host IPv6 literal
    before = deniedLogs().length;
    res = await post(WEBVIEW, `[::1]:${port}`);
    expect(res.status).toBe(403);
    expectDeniedLog(1, 'host-mismatch', before);

    // 5) BOTH fail — TDD §3.3 v1.1 precedence: Phase 1.5 (Host) runs FIRST →
    //    host-mismatch wins ("deny đầu tiên định reason"). NOTE for QA: STC
    //    IT-06 step 5 still asserts origin-not-allowed (v1.0 ordering leftover,
    //    superseded by AD-10/I-8) — TDD v1.1 + FSD BR-05 v1.2 are authoritative.
    before = deniedLogs().length;
    res = await post('https://evil.com', `attacker.com:${port}`);
    expect(res.status).toBe(403);
    expectDeniedLog(1, 'host-mismatch', before);

    expect(deps.restCallToolMock.calls).toHaveLength(0); // no variant reached the tool
  });

  // ── T7 / IT-07: SSE GET evil → 403 BEFORE any byte of the stream ──
  it('T7 (IT-07): GET /mcp SSE evil → 403, no SSE bytes; allowed branch still opens', async () => {
    const before = deniedLogs().length;
    const res = await requestWithHeaders(port, {
      method: 'GET', path: '/mcp',
      headers: { Origin: 'https://evil.com', Host: `127.0.0.1:${port}` },
    });
    expect(res.status).toBe(403);
    assertNoAccessControlHeaders(res.headers);
    expect(res.body).not.toContain('event:');
    expect(res.body).not.toContain('text/event-stream'); // P6-17 closed (AC-6)
    expectDeniedLog(1, 'origin-not-allowed', before);

    // Allowed branch: native no-Origin SSE opens as before (FR-10)
    const sse = await openSse(port);
    expect(sse.status).toBe(200);
    expect(sse.contentType).toContain('text/event-stream');
    expect(sse.chunk).toContain('event: message');
  });

  // ── T8 / IT-08: bind address invariant 127.0.0.1 (AC-7, verify-only) ──
  it('T8 (IT-08): server binds 127.0.0.1 with the real listen port (FR-11)', () => {
    expect(suite.server.boundAddress).toBe('127.0.0.1');
    expect(suite.server.listeningPort).toBe(port);
    expect(port).toBeGreaterThan(0);
  });

  // ── T9 / IT-09: anti log-forging — both defense layers proven ──
  it('T9 (IT-09): CRLF injection — client rejects; raw path 400; log sanitized', async () => {
    // Layer 1 — Node client/llhttp rejects control chars in header values.
    let rejected = false;
    try {
      await requestWithHeaders(port, {
        method: 'POST', path: '/mcp',
        headers: { Origin: 'https://evil.com\r\nX-Injected: 1\0more', Host: 'localhost\r\n:9181' },
        body: rpc(50, 'ping'),
      });
    } catch { rejected = true; }
    expect(rejected).toBe(true);

    // Layer 1b — raw socket with injected CRLF: llhttp answers 400 (or drops)
    // BEFORE the gate; the server must survive.
    const raw = await sendRawRequest(port,
      'POST /mcp HTTP/1.1\r\nHost: 127.0.0.1:%PORT%\r\nOrigin: https://evil.com\r\nX-Injected: 1\0more\r\nConnection: close\r\n\r\n'
        .replace('%PORT%', String(port)));
    expect(raw.status === 400 || raw.status === null).toBe(true);

    // Layer 2 — gate-internal sanitize: no captured log line carries \r \n \0.
    for (const line of logLines) {
      expect(/[\r\n\0]/.test(line)).toBe(false);
    }
    // Deny body shape is clean even for malformed callers (G-3/FR-08).
    const after = await requestWithHeaders(port, {
      method: 'POST', path: '/mcp',
      headers: { Origin: '%%', Host: `127.0.0.1:${port}`, 'Content-Type': 'application/json' },
      body: rpc(51, 'ping'),
    });
    expect(after.status).toBe(403);
    expect(after.body).toBe('{"error":"Forbidden"}');
  });
});
