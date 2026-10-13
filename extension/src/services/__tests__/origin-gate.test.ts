/**
 * SA4E-358 — OriginGate unit suite (mức 1 — pure function, no server).
 * STC v1.1: UT-01..39 (38 required + 1 optional SEC-358-05) + PBT-01..04.
 * Test data: documents/SA4E-358/testdata/origin-host-corpus.csv (row per ID).
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  evaluateOriginGate,
  extractGateHeaders,
  ALLOWED_ORIGIN_PATTERNS,
  type OriginGateDeny,
} from '../OriginGate';

/** Build a flat rawHeaders array from [name, value] pairs. */
const H = (...pairs: Array<[string, string]>): string[] => pairs.flat();

const HOST_OK = ['Host', '127.0.0.1:9181'] as [string, string];

function expectDeny(r: ReturnType<typeof evaluateOriginGate>, reason: string): OriginGateDeny {
  expect(r.ok).toBe(false);
  expect((r as OriginGateDeny).reason).toBe(reason);
  return r as OriginGateDeny;
}

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

// ── PBT-01..04 — property-based (fast-check), STC v1.1 §1 ───────────────────
describe('OriginGate PBT-01..04 (fast-check)', () => {
  it('PBT-01: every input yields a valid discriminated-union result shape', () => {
    // STC: PBT-01 (seed 388911) — FR-12, BR-01, G-1
    fc.assert(
      fc.property(
        fc.array(fc.string({ maxLength: 200 }), { maxLength: 40 }),
        fc.integer(),
        (rawHeaders, listenPort) => {
          const r = evaluateOriginGate(rawHeaders, listenPort);
          if (r.ok) {
            expect('echoOrigin' in r).toBe(true);
            expect(r.echoOrigin === null || typeof r.echoOrigin === 'string').toBe(true);
          } else {
            expect(['origin-not-allowed', 'host-mismatch', 'malformed-origin']).toContain(r.reason);
            expect(typeof r.originSanitized).toBe('string');
            expect(typeof r.hostSanitized).toBe('string');
          }
        },
      ),
      { numRuns: 10_000, seed: 388911 },
    );
  });

  it('PBT-02: gate + extract never throw for any adversarial input (G-1)', () => {
    // STC: PBT-02 (seed 388912) — G-1, FR-12, BR-01
    const adversarial = fc.constantFrom(
      '%%', 'null', 'javascript:alert(1)', 'localhost:3000', 'file://x', '',
      'https://evil.com\r\nX: 1\0', 'vscode-webview://a\tb', '\r\n', 'HTTP/1.0',
    );
    const rawHeaders = fc.oneof(
      fc.array(adversarial, { maxLength: 10 }),
      fc.array(fc.string({ maxLength: 20 }), { maxLength: 9 }), // may be odd-length
    );
    const ports = fc.constantFrom(0, NaN, -1, 9181, 65536, 80);
    fc.assert(
      fc.property(rawHeaders, ports, (h, p) => {
        expect(() => evaluateOriginGate(h, p)).not.toThrow();
        expect(() => extractGateHeaders(h)).not.toThrow();
      }),
      { numRuns: 10_000, seed: 388912 },
    );
  });

  it('PBT-03: every DENY payload is sanitized — no \\r\\n\\0 survives (G-3)', () => {
    // STC: PBT-03 (seed 388913) — G-3, BR-04, FR-09, R-4
    const withControls = fc.string({ maxLength: 80 }).map((s) => {
      const injection = fc.sample(fc.constantFrom('\r', '\n', '\0'), 2).join('');
      return injection.length > 0 ? s + injection : s + '\r';
    });
    fc.assert(
      fc.property(withControls, withControls, (originVal, hostVal) => {
        const r = evaluateOriginGate(H(['Origin', originVal], ['Host', hostVal]), 9181);
        if (!r.ok) {
          expect(/[\r\n\0]/.test(r.originSanitized)).toBe(false);
          expect(/[\r\n\0]/.test(r.hostSanitized)).toBe(false);
        }
      }),
      { numRuns: 10_000, seed: 388913 },
    );
  });

  it('PBT-04: no-Origin inputs classify into exactly 3 monotonic classes (I-8)', () => {
    // STC: PBT-04 (seed 388914) — BR-06, FR-02a, FR-04, SEC-358-01, I-8
    const hostCorpus = fc.constantFrom(
      undefined, // no Host at all (HTTP/1.0 carve-out)
      '', // empty Host = absent after trim
      '127.0.0.1:9181', 'localhost:9181', 'LOCALHOST:9181', '127.0.0.1:09181',
      'attacker.com:9181', '[::1]:9181', '127.0.0.1:abc', 'evil.com:9181', '0.0.0.0:9181', '127.1:9181',
    );
    const port = fc.integer({ min: 0, max: 65535 });
    fc.assert(
      fc.property(hostCorpus, port, (hostVal, listenPort) => {
        const headers = hostVal === undefined ? [] : H(['Host', hostVal]);
        const r = evaluateOriginGate(headers, listenPort);
        if (hostVal === undefined || hostVal === '') {
          expect(r).toEqual({ ok: true, echoOrigin: null }); // class (a)
        } else if (
          ['127.0.0.1:9181', 'localhost:9181', 'LOCALHOST:9181', '127.0.0.1:09181'].includes(hostVal)
          && listenPort === 9181
        ) {
          expect(r).toEqual({ ok: true, echoOrigin: null }); // class (b)
        } else {
          expect(r.ok).toBe(false); // class (c)
          if (!r.ok) expect(r.reason).toBe('host-mismatch');
        }
      }),
      { numRuns: 10_000, seed: 388914 },
    );
  });
});
