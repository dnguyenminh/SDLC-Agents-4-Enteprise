/**
 * SA4E-358 — OriginGate unit suite (mức 1 — pure function, no server).
 * STC v1.1: UT-01..15 (extract + no-Origin + malformed groups).
 * Test data: documents/SA4E-358/testdata/origin-host-corpus.csv (row per ID).
 * (Split from origin-gate.test.ts — extract/no-Origin/malformed concern.)
 */
import { describe, it, expect } from 'vitest';
import { evaluateOriginGate, extractGateHeaders } from '../OriginGate';
import { H, HOST_OK, expectDeny } from './origin-gate.helpers';

// ── Group 1 — extractGateHeaders (UT-01..05) ────────────────────────────────
describe('OriginGate extract (UT-01..05)', () => {
  it('UT-01: single origin + host pair extracts cleanly', () => {
    // STC: UT-01 — FR-12, G-2
    const h = extractGateHeaders(H(['Origin', 'http://x.com'], HOST_OK));
    expect(h).toEqual({
      origin: 'http://x.com',
      host: '127.0.0.1:9181',
      duplicateOrigin: false,
      duplicateHost: false,
    });
  });

  it('UT-02: two Origin pairs → duplicateOrigin true (last value kept)', () => {
    // STC: UT-02 — R-6, FR-12
    const h = extractGateHeaders(H(['Origin', 'a'], ['Origin', 'b'], HOST_OK));
    expect(h.duplicateOrigin).toBe(true);
    expect(h.origin).toBe('b');
  });

  it('UT-03: two Host pairs → duplicateHost true (smuggling surface)', () => {
    // STC: UT-03 — FR-12, R-6
    const h = extractGateHeaders(H(['Host', '127.0.0.1:9181'], ['Host', 'evil.com:9181']));
    expect(h.duplicateHost).toBe(true);
  });

  it('UT-04: mixed key casing (ORIGIN/origin) still detects duplicates', () => {
    // STC: UT-04 — C-3, FR-12 (keys compare lowercase)
    const h = extractGateHeaders(H(['ORIGIN', 'a'], ['origin', 'b']));
    expect(h.duplicateOrigin).toBe(true);
    expect(h.origin).toBe('b');
  });

  it('UT-05: empty and odd-length arrays → undefined, no throw (G-1, E-5)', () => {
    // STC: UT-05 — G-1, E-5 (loop guard i+1 < length)
    expect(extractGateHeaders([])).toEqual({
      origin: undefined, host: undefined, duplicateOrigin: false, duplicateHost: false,
    });
    expect(() => extractGateHeaders(['Origin'])).not.toThrow();
    const h = extractGateHeaders(['Origin']);
    expect(h.origin).toBeUndefined();
    expect(h.duplicateOrigin).toBe(false);
  });
});

// ── Group 2 — no-Origin branch (UT-06..08) ──────────────────────────────────
describe('OriginGate no-Origin (UT-06..08)', () => {
  it('UT-06: no Origin + Host loopback → PASS echoOrigin=null (BR-06)', () => {
    // STC: UT-06 — FR-02a, BR-06
    expect(evaluateOriginGate(H(HOST_OK), 9181)).toEqual({ ok: true, echoOrigin: null });
  });

  it('UT-07: Origin empty string → PASS (trim = absent)', () => {
    // STC: UT-07 — FR-02a, BR-06
    expect(evaluateOriginGate(H(['Origin', ''], HOST_OK), 9181))
      .toEqual({ ok: true, echoOrigin: null });
  });

  it('UT-08: Origin whitespace-only → PASS (trim)', () => {
    // STC: UT-08 — FR-02a, BR-06
    expect(evaluateOriginGate(H(['Origin', '   '], HOST_OK), 9181))
      .toEqual({ ok: true, echoOrigin: null });
  });
});

// ── Group 3 — malformed origins (UT-09..15) ─────────────────────────────────
describe('OriginGate malformed (UT-09..15)', () => {
  it('UT-09: "%%" → URL throw → deny malformed-origin', () => {
    // STC: UT-09 — FR-12, G-1
    const d = expectDeny(evaluateOriginGate(H(['Origin', '%%'], HOST_OK), 9181), 'malformed-origin');
    expect(d.originSanitized).toBe('%%');
  });

  it('UT-10: "null" literal → URL throw → deny malformed-origin', () => {
    // STC: UT-10 — FR-12
    expectDeny(evaluateOriginGate(H(['Origin', 'null'], HOST_OK), 9181), 'malformed-origin');
  });

  it('UT-11: file:// scheme → deny (never pass)', () => {
    // STC: UT-11 — FR-12, BR-02 (reason may be origin-not-allowed or malformed)
    const r = evaluateOriginGate(H(['Origin', 'file://x'], HOST_OK), 9181);
    expect(r.ok).toBe(false);
  });

  it('UT-12: "localhost:3000" scheme-only → hostname empty → deny malformed', () => {
    // STC: UT-12 — FR-12 (P3c — not the catch path)
    expectDeny(evaluateOriginGate(H(['Origin', 'localhost:3000'], HOST_OK), 9181), 'malformed-origin');
  });

  it('UT-13: comma inside Origin → deny malformed (dual-check vs Node join)', () => {
    // STC: UT-13 — FR-12, C-3
    expectDeny(
      evaluateOriginGate(H(['Origin', 'http://a.com,http://b.com'], HOST_OK), 9181),
      'malformed-origin',
    );
  });

  it('UT-14: duplicate Origin pairs → deny malformed, NO first-wins (AD-2)', () => {
    // STC: UT-14 — FR-12, R-6, AD-2 (1 of the 2 values is valid — still deny)
    const d = expectDeny(
      evaluateOriginGate(H(['Origin', 'vscode-webview://abc'], ['Origin', 'https://evil.com'], HOST_OK), 9181),
      'malformed-origin',
    );
    expect(d.originSanitized).toBe('vscode-webview://abc, https://evil.com');
  });

  it('UT-15: vscode-webview opaque host with ":" → URL throw → deny malformed', () => {
    // STC: UT-15 — FR-12 (webview URLs never carry ports)
    expectDeny(evaluateOriginGate(H(['Origin', 'vscode-webview://abc:9181'], HOST_OK), 9181), 'malformed-origin');
  });
});
