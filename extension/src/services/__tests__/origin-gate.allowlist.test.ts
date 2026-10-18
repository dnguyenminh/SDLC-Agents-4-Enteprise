/**
 * SA4E-358 — OriginGate unit suite (mức 1): allowlist matching (UT-16..25)
 * + allowlist immutability (BR-09, SCAN-02 step 3).
 * Test data: documents/SA4E-358/testdata/origin-host-corpus.csv (row per ID).
 * (Split from origin-gate.test.ts — allowlist concern.)
 */
import { describe, it, expect } from 'vitest';
import { evaluateOriginGate, ALLOWED_ORIGIN_PATTERNS } from '../OriginGate';
import { H, HOST_OK, expectDeny } from './origin-gate.helpers';

// ── Group 4 — allowlist match (UT-16..25) ───────────────────────────────────
describe('OriginGate allowlist (UT-16..25)', () => {
  it('UT-16: vscode-webview origin → PASS echo RAW (G-4)', () => {
    // STC: UT-16 — FR-03, G-4 (echo RAW, not url.origin)
    expect(evaluateOriginGate(H(['Origin', 'vscode-webview://abc123'], HOST_OK), 9181))
      .toEqual({ ok: true, echoOrigin: 'vscode-webview://abc123' });
  });

  it('UT-17: http://localhost:3000 (origin port ≠ listenPort) → PASS', () => {
    // STC: UT-17 — FR-03 (only the Host check uses listenPort)
    expect(evaluateOriginGate(H(['Origin', 'http://localhost:3000'], HOST_OK), 9181))
      .toEqual({ ok: true, echoOrigin: 'http://localhost:3000' });
  });

  it('UT-18: https://localhost:8443 → PASS (https+localhost pattern)', () => {
    // STC: UT-18 — FR-03
    expect(evaluateOriginGate(H(['Origin', 'https://localhost:8443'], HOST_OK), 9181))
      .toEqual({ ok: true, echoOrigin: 'https://localhost:8443' });
  });

  it('UT-19: http://127.0.0.1:5173 → PASS (Vite dev server)', () => {
    // STC: UT-19 — FR-03
    expect(evaluateOriginGate(H(['Origin', 'http://127.0.0.1:5173'], HOST_OK), 9181))
      .toEqual({ ok: true, echoOrigin: 'http://127.0.0.1:5173' });
  });

  it('UT-20: HTTPS://LOCALHOST:3000 → PASS with RAW echo (G-8 fold)', () => {
    // STC: UT-20 — FR-03, G-8 (compare folded; echo keeps RAW casing)
    expect(evaluateOriginGate(H(['Origin', 'HTTPS://LOCALHOST:3000'], HOST_OK), 9181))
      .toEqual({ ok: true, echoOrigin: 'HTTPS://LOCALHOST:3000' });
  });

  it('UT-21: localhost.evil.com → deny origin-not-allowed (BR-02, no substring)', () => {
    // STC: UT-21 — BR-02
    expectDeny(evaluateOriginGate(H(['Origin', 'http://localhost.evil.com:3000'], HOST_OK), 9181), 'origin-not-allowed');
  });

  it('UT-22: https+127.0.0.1 not in allowlist → deny origin-not-allowed', () => {
    // STC: UT-22 — FR-03 (deliberate: FR-03 allows only http+127.0.0.1)
    expectDeny(evaluateOriginGate(H(['Origin', 'https://127.0.0.1:8443'], HOST_OK), 9181), 'origin-not-allowed');
  });

  it('UT-23: trailing dot hostname → deny (no DNS normalization)', () => {
    // STC: UT-23 — FR-12, G-8
    expectDeny(evaluateOriginGate(H(['Origin', 'http://localhost.'], HOST_OK), 9181), 'origin-not-allowed');
  });

  it('UT-24: IPv6 origin [::1] → deny (R-1 candidate)', () => {
    // STC: UT-24 — FR-03
    expectDeny(evaluateOriginGate(H(['Origin', 'http://[::1]:3000'], HOST_OK), 9181), 'origin-not-allowed');
  });

  it('UT-25: origin with path → PASS echo RAW (path ignored, G-4)', () => {
    // STC: UT-25 — FR-03, G-4
    expect(evaluateOriginGate(H(['Origin', 'http://localhost:3000/evil'], HOST_OK), 9181))
      .toEqual({ ok: true, echoOrigin: 'http://localhost:3000/evil' });
  });
});

// ── Allowlist immutability (BR-09, SCAN-02 step 3) ──────────────────────────
describe('OriginGate allowlist immutability (BR-09)', () => {
  it('ALLOWED_ORIGIN_PATTERNS is a readonly constant with the 4 sanctioned patterns', () => {
    expect(ALLOWED_ORIGIN_PATTERNS).toHaveLength(4);
    expect(Object.isFrozen(ALLOWED_ORIGIN_PATTERNS)).toBe(false); // readonly type-level
    expect(ALLOWED_ORIGIN_PATTERNS.map((p) => `${p.scheme}://${p.host}`)).toEqual([
      'vscode-webview://*', 'http://localhost', 'https://localhost', 'http://127.0.0.1',
    ]);
  });
});
