/**
 * SA4E-358 Origin Gate — integration matrix T13..T14 (STC IT-13..14, mức 2).
 * Preflight matrix vs preflight-matrix.csv + gate micro-overhead sanity.
 * T14 micro-sanity mirrors bench-gate.ts; the full bench (10^6/class + e2e
 * delta, evidence CSV) runs on-demand per STC IT-14/FSD §8.1 — NOT in the
 * default CI suite.
 * (Split from wrapper-server.test.ts — origin-gate concern, T13..T14.)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { evaluateOriginGate } from '../services/OriginGate';
import { startOriginGateSuite, OriginGateSuite } from './wrapper-server.origin-gate.helpers';
import { requestWithHeaders, assertNoAccessControlHeaders } from './wrapper-server.http.helpers';

describe('SA4E-358 Origin Gate (T1..T14)', () => {
  let suite: OriginGateSuite;
  let deps: OriginGateSuite['deps'];
  let port: number;
  let deniedLogs: OriginGateSuite['deniedLogs'];
  let expectDeniedLog: OriginGateSuite['expectDeniedLog'];

  beforeAll(async () => {
    suite = await startOriginGateSuite();
    ({ deps, port, deniedLogs, expectDeniedLog } = suite);
  });

  afterAll(async () => {
    await suite.teardown();
  });

  beforeEach(() => {
    deps.restCallToolMock.calls = [];
    deps.restCallToolMock.result = { content: [{ type: 'text', text: '{}' }] };
  });

  // ── T13 / IT-13: preflight matrix — 7 rows × ACAM present/absent = 14 ──
  it('T13 (IT-13): preflight matrix 14/14 matches preflight-matrix.csv (ACAM ignored)', async () => {
    type Row = { id: string; origin?: string; host: string; status: number; acao?: string; reason?: string };
    const P = String(port);
    const rows: Row[] = [
      { id: '1a', host: `127.0.0.1:${P}`, status: 204 }, // no-Origin + loopback (AD-8)
      { id: '1b', host: `attacker.com:${P}`, status: 403, reason: 'host-mismatch' }, // SEC-358-01/I-8
      { id: '2', origin: 'vscode-webview://abc123', host: `127.0.0.1:${P}`, status: 204, acao: 'vscode-webview://abc123' },
      { id: '3', origin: 'http://localhost:3000', host: `localhost:${P}`, status: 204, acao: 'http://localhost:3000' },
      { id: '4', origin: 'https://evil.com', host: `127.0.0.1:${P}`, status: 403, reason: 'origin-not-allowed' },
      { id: '5', origin: 'vscode-webview://abc', host: `attacker.com:${P}`, status: 403, reason: 'host-mismatch' }, // FR-04
      { id: '6', origin: '%%', host: `127.0.0.1:${P}`, status: 403, reason: 'malformed-origin' }, // FR-12
    ];
    for (const row of rows) {
      for (const acam of [true, false]) {
        const before = deniedLogs().length;
        const res = await requestWithHeaders(port, {
          method: 'OPTIONS', path: '/mcp',
          headers: {
            Host: row.host,
            ...(row.origin === undefined ? {} : { Origin: row.origin }),
            ...(acam ? { 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'Content-Type' } : {}),
          },
        });
        expect(res.status, `row ${row.id} acam=${acam}`).toBe(row.status);
        if (row.acao) {
          expect(res.headers['access-control-allow-origin']).toBe(row.acao);
          expect(res.headers['access-control-allow-methods']).toBe('GET, POST, OPTIONS');
        } else {
          assertNoAccessControlHeaders(res.headers);
        }
        if (row.reason) expectDeniedLog(1, row.reason, before);
      }
    }
  });

  // ── T14 / IT-14: gate overhead sanity (full bench = bench-gate.ts, on-demand) ──
  it('T14 (IT-14): gate micro-overhead — p99 of a 20k-call sample < 1ms (NFR)', () => {
    const headers = ['Host', `127.0.0.1:${port}`, 'Origin', 'vscode-webview://abc123'];
    for (let i = 0; i < 2000; i++) evaluateOriginGate(headers, port); // warmup
    const samples: number[] = [];
    for (let i = 0; i < 20_000; i++) {
      const t0 = process.hrtime.bigint();
      evaluateOriginGate(headers, port);
      samples.push(Number(process.hrtime.bigint() - t0) / 1000); // µs
    }
    samples.sort((a, b) => a - b);
    const p99 = samples[Math.floor(samples.length * 0.99)];
    expect(p99).toBeLessThan(1000); // < 1ms (expected <10µs)
  });
});
