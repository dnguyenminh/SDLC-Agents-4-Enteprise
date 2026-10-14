/**
 * SA4E-360 — redactSecretLike completeness property (STC PBT-09; SEC-360-01).
 * Fixture data: documents/SA4E-360/testdata/secret-redaction-testdata.csv
 * (SEC-A..SEC-F families + SEC-L non-secret control) + the 11 F-2 expansion
 * families (commit 0d33706 — SECURITY-ASSESSMENT §Detailed Findings F-2,
 * scenario per evidence/f-fix-verification-2026-10-15.log §2).
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { redactSecretLike, REDACTED_MARKER } from '../secret-redaction.js';

/** Secret family samples the property splices into strings. */
const SECRET_SAMPLES: readonly string[] = [
  // Baseline families (CSV SEC-A..SEC-F).
  'sk-live-abcdefgh1234567890',
  'AKIAIOSFODNN7EXAMPLE',
  'ghp_0123456789abcdefghijklmnopqrstuvwxyz',
  'xoxb-123456789-abcdefghij',
  '-----BEGIN RSA PRIVATE KEY-----',
  "password = 'Sup3rS3cret!'",
  'API_KEY = "abcdef1234567890"',
  'token: hunter2hunter2',
  // F-2 (SA4E-360 remediation) — the new deny-list families.
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
  'postgres://app_user:S3cretPassw0rd@db.example.com:5432/app',
  'sk_live_51H8xQ2eZvKYlo2Cq7Tt',
  'github_pat_11ABCDEFG0abcdefghij1234567890',
  'glpat-AbCdEfGhIjKlMnOpQrSt12',
  'npm_AbCdEfGhIjKlMnOpQrStUv',
  'AIzaSyD-9tJqS2FvBJEuRPnlHbUMPvJYjKxGjSk',
  'AccountKey="aZ9xK2mP5qR8sT3uV7wY1bN4cD6fH0jL=="',
  "pwd = 'Sup3rS3cret!'",
  'passphrase = "correct horse battery staple 123"',
  'aws_secret_access_key = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"',
];

/** Non-secret control fragments that must survive byte-identical (SEC-L). */
const CONTROL_SAMPLES: readonly string[] = [
  'export function calculateBudget(input: BudgetInput): ContextBudget',
  'method extractOutline(filePath, symbols, maxTokens)',
  'class SymbolOutlineExtractor implements',
  'const total = parts.length + 1;',
  'returns a mapped [REDACTED] marker document',
];

const NOISE: readonly string[] = [' ', '  ', '\t', 'fn(', ')', ' => ', 'x', 'value', '.map(', '1'];

// STC PBT-09 — completeness + no-over-redaction + idempotence
describe('PBT-09: redactSecretLike completeness property (SEC-360-01)', () => {
  it('removes every spliced secret and preserves non-secret controls', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...SECRET_SAMPLES), { minLength: 1, maxLength: 5 }),
        fc.array(fc.constantFrom(...CONTROL_SAMPLES), { minLength: 0, maxLength: 3 }),
        fc.array(fc.constantFrom(...NOISE), { minLength: 0, maxLength: 8 }),
        (secrets, controls, noise) => {
          // Secrets are space-joined so every family keeps its word boundary;
          // noise only decorates the non-secret tail.
          const raw = [...secrets, ...controls].join(' ') + (noise.length ? ` ${noise.join('')}` : '');
          const out = redactSecretLike(raw);
          // Every secret sample is fully gone — zero deny-list matches remain.
          for (const secret of secrets) {
            expect(out).not.toContain(secret);
            expect(out).toContain(REDACTED_MARKER);
          }
          // Applying again changes nothing — no partial secret survived.
          expect(redactSecretLike(out)).toBe(out);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('preserves non-secret control strings byte-identical (no over-redaction)', () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...CONTROL_SAMPLES), { minLength: 1, maxLength: 4 }), (controls) => {
        const raw = controls.join(' | ');
        expect(redactSecretLike(raw)).toBe(raw);
      }),
      { numRuns: 100 }
    );
  });

  it('is idempotent for arbitrary inputs (PBT-09 step 4)', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 300 }),
        fc.constantFrom(...SECRET_SAMPLES),
        (text, secret) => {
          const once = redactSecretLike(`${text}${secret}${text}`);
          expect(redactSecretLike(once)).toBe(once);
        }
      ),
      { numRuns: 200 }
    );
  });
});
