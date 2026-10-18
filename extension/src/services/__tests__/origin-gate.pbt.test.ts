/**
 * SA4E-358 — OriginGate unit suite (mức 1): PBT-01..04 property-based
 * (fast-check), STC v1.1 §1.
 * (Split from origin-gate.test.ts — property-based concern.)
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { evaluateOriginGate, extractGateHeaders } from '../OriginGate';
import { H } from './origin-gate.helpers';

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
