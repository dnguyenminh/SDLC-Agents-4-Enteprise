/**
 * SA4E-358 — OriginGate unit suite (mức 1): Host check (UT-26..31b),
 * SEC-358-01 Option A per-request Host check (UT-32..34, H-7/H-8/H-9),
 * robustness (UT-35..39 incl. optional SEC-358-05).
 * (Split from origin-gate.test.ts — host/robustness concern.)
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { evaluateOriginGate, type OriginGateDeny } from '../OriginGate';
import { H, HOST_OK, expectDeny } from './origin-gate.helpers';

// ── Group 5 — Host check when Origin present (UT-26..31) ────────────────────
describe('OriginGate host check (UT-26..31)', () => {
  const WEBVIEW = ['Origin', 'vscode-webview://abc'] as [string, string];

  it('UT-26: Host attacker.com → deny host-mismatch (DNS rebinding UC-05)', () => {
    // STC: UT-26 — FR-04, BR-03
    expectDeny(evaluateOriginGate(H(WEBVIEW, ['Host', 'attacker.com:9181']), 9181), 'host-mismatch');
  });

  it('UT-27: Host port = listen+1 → deny (exact port — G-7 no hardcode)', () => {
    // STC: UT-27 — FR-04, BR-03, G-7
    expectDeny(evaluateOriginGate(H(WEBVIEW, ['Host', '127.0.0.1:9182']), 9181), 'host-mismatch');
  });

  it('UT-28: Origin present + Host missing → deny host-mismatch (EF-1)', () => {
    // STC: UT-28 — FR-04, EF-1 UC-05 (HTTP/1.0 with Origin)
    expectDeny(evaluateOriginGate(H(WEBVIEW), 9181), 'host-mismatch');
  });

  it('UT-29: Host IPv6 literal → deny host-mismatch (P5b)', () => {
    // STC: UT-29 — FR-04 (bind is 127.0.0.1 — ::1 never reaches the server)
    expectDeny(evaluateOriginGate(H(WEBVIEW, ['Host', '[::1]:9181']), 9181), 'host-mismatch');
  });

  it('UT-30: Host malformed port (:abc / bare colon) → deny host-mismatch', () => {
    // STC: UT-30 — FR-04 (port must match /^\d+$/)
    expectDeny(evaluateOriginGate(H(WEBVIEW, ['Host', '127.0.0.1:abc']), 9181), 'host-mismatch');
    expectDeny(evaluateOriginGate(H(WEBVIEW, ['Host', '127.0.0.1:']), 9181), 'host-mismatch');
  });

  it('UT-03b (evaluate-level): duplicate Host pairs → deny host-mismatch (no first-wins)', () => {
    // Companion of UT-03 at the evaluate level — request-smuggling fail-closed.
    const d = expectDeny(
      evaluateOriginGate(H(WEBVIEW, ['Host', '127.0.0.1:9181'], ['Host', 'evil.com:9181']), 9181),
      'host-mismatch',
    );
    expect(d.hostSanitized).toBe('127.0.0.1:9181, evil.com:9181');
  });

  it('UT-31b: Host without port → effectivePort 80 ≠ listenPort → deny (P5c default)', () => {
    // Host "localhost" (no port) defaults to port 80 — never matches :9181.
    expectDeny(evaluateOriginGate(H(['Host', 'localhost']), 9181), 'host-mismatch');
  });

  it('UT-31: Host LOCALHOST:9181 / 127.0.0.1:09181 → PASS (fold + numeric, G-8)', () => {
    // STC: UT-31 — FR-04, G-8
    expect(evaluateOriginGate(H(['Origin', 'http://localhost:3000'], ['Host', 'LOCALHOST:9181']), 9181))
      .toEqual({ ok: true, echoOrigin: 'http://localhost:3000' });
    expect(evaluateOriginGate(H(['Origin', 'http://localhost:3000'], ['Host', '127.0.0.1:09181']), 9181))
      .toEqual({ ok: true, echoOrigin: 'http://localhost:3000' });
  });
});

// ── Group 6 — Host check on EVERY request with a Host (SEC-358-01 Option A,
//              I-8) — remediation tests H-7/H-8/H-9 (UT-32..34) ─────────────
describe('OriginGate host-mọi-request — SEC-358-01 Option A (UT-32..34)', () => {
  it('UT-32 (H-7): no-Origin + Host attacker.com → DENY host-mismatch (rebind same-origin)', () => {
    // STC: UT-32 — SEC-358-01, FR-04, I-8 (AC-5) — merge condition #4
    const d = expectDeny(evaluateOriginGate(H(['Host', 'attacker.com:9181']), 9181), 'host-mismatch');
    expect(d.originSanitized).toBe('');
    expect(d.hostSanitized).toBe('attacker.com:9181');
  });

  it('UT-33 (H-8): no-Origin + Host loopback correct port → PASS (native not blocked)', () => {
    // STC: UT-33 — SEC-358-01, I-8, BR-06 (AC-4/AC-5) — zero-breakage proof
    expect(evaluateOriginGate(H(['Host', '127.0.0.1:9181']), 9181)).toEqual({ ok: true, echoOrigin: null });
    expect(evaluateOriginGate(H(['Host', 'localhost:9181']), 9181)).toEqual({ ok: true, echoOrigin: null });
    expect(evaluateOriginGate(H(['Host', 'LOCALHOST:9181']), 9181)).toEqual({ ok: true, echoOrigin: null });
  });

  it('UT-34 (H-9): no-Origin + NO Host (HTTP/1.0 legacy) → PASS (only carve-out)', () => {
    // STC: UT-34 — SEC-358-01, I-8 (AC-4); guards against over-blocking HTTP/1.0
    expect(evaluateOriginGate(H([]), 9181)).toEqual({ ok: true, echoOrigin: null });
    expect(evaluateOriginGate(H(['Host', '']), 9181)).toEqual({ ok: true, echoOrigin: null });
    // UT-28 counterpart stays deny: Origin + no Host → host-mismatch
    expectDeny(evaluateOriginGate(H(['Origin', 'vscode-webview://abc']), 9181), 'host-mismatch');
  });
});

// ── Group 7 — robustness (UT-35..38) + optional UT-39 (SEC-358-05) ──────────
describe('OriginGate robustness (UT-35..39)', () => {
  it('UT-35: control chars in headers → deny + sanitized (G-3 inside gate)', () => {
    // STC: UT-35 — G-3, BR-04, R-4
    const r = evaluateOriginGate(
      H(['Origin', 'https://evil.com\r\nX-Injected: 1\0more'], ['Host', 'localhost\r\n:9181']),
      9181,
    );
    expect(r.ok).toBe(false);
    const d = r as OriginGateDeny;
    expect(/[\r\n\0]/.test(d.originSanitized)).toBe(false);
    expect(/[\r\n\0]/.test(d.hostSanitized)).toBe(false);
    expect(d.hostSanitized).toBe('localhost??:9181'); // every control char → '?'
  });

  it('UT-36: listenPort=0 (defensive AD-7) → every Host check fails → deny', () => {
    // STC: UT-36 — BR-01, AD-7
    expectDeny(evaluateOriginGate(H(['Origin', 'vscode-webview://abc'], HOST_OK), 0), 'host-mismatch');
  });

  it('UT-37: javascript: scheme → deny (not pass, no throw)', () => {
    // STC: UT-37 — BR-02, G-1
    const r = evaluateOriginGate(H(['Origin', 'javascript:alert(1)'], HOST_OK), 9181);
    expect(r.ok).toBe(false);
  });

  it('UT-38: fuzz — 100 random rawHeaders arrays never throw, always shape-ok', () => {
    // STC: UT-38 — G-1, FR-12
    const junk = fc.string({ maxLength: 60 });
    const arr = fc.array(junk, { maxLength: 12 });
    fc.assert(
      fc.property(arr, fc.integer({ min: 0, max: 65535 }), (rawHeaders, port) => {
        expect(() => evaluateOriginGate(rawHeaders, port)).not.toThrow();
        const r = evaluateOriginGate(rawHeaders, port);
        expect(typeof r.ok).toBe('boolean');
      }),
      { numRuns: 100 },
    );
  });

  it('UT-39 (optional SEC-358-05): Origin with [\\t\\n\\r\\f\\v] denied BEFORE new URL', () => {
    // STC: UT-39 — SEC-358-05 (defense-in-depth implemented), G-1, BR-01
    for (const ch of ['\t', '\n', '\r', '\f', '\v']) {
      const r = evaluateOriginGate(H(['Origin', `vscode-webview://a${ch}b`], HOST_OK), 9181);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('malformed-origin');
    }
    // Zero false positive: clean origin still passes with EXACT echo (G-4)
    expect(evaluateOriginGate(H(['Origin', 'vscode-webview://abc123'], HOST_OK), 9181))
      .toEqual({ ok: true, echoOrigin: 'vscode-webview://abc123' });
  });
});
