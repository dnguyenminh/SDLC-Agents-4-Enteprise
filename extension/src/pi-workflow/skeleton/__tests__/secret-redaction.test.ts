/**
 * SA4E-360 — secret-redaction unit tests (STC UT-30, UT-34; SEC-360-01/07).
 * Fixture data: documents/SA4E-360/testdata/secret-redaction-testdata.csv
 * (SEC-A..SEC-G, SEC-K, SEC-L).
 */
import { describe, it, expect } from 'vitest';
import {
  redactSecretLike,
  stripControlChars,
  sanitizeCodeText,
  isSecretFileName,
  REDACTED_MARKER,
} from '../secret-redaction.js';

const FAMILIES: Array<[string, string]> = [
  ['sk-live-abcdefgh1234567890', 'api key (SEC-A)'],
  ['AKIAIOSFODNN7EXAMPLE', 'aws access key (SEC-B)'],
  ['ghp_0123456789abcdefghijklmnopqrstuvwxyz', 'github token (SEC-C)'],
  ['xoxb-123456789-abcdefghij', 'slack token (SEC-D)'],
  ['-----BEGIN RSA PRIVATE KEY-----', 'pem header (SEC-E)'],
  ["password = 'Sup3rS3cret!'", 'credential assignment (SEC-F)'],
];

// STC UT-30 — every deny-list family → [REDACTED]
describe('redactSecretLike (SEC-360-01)', () => {
  it('redacts every deny-list family occurrence', () => {
    for (const [secret, label] of FAMILIES) {
      const out = redactSecretLike(`const value = ${secret};`);
      expect(out).toBe(`const value = ${REDACTED_MARKER};`);
      expect(out).not.toContain(secret);
      void label;
    }
  });

  it('redacts case-insensitive assignment variants (Password:, API_KEY =)', () => {
    expect(redactSecretLike('Password: hunter2hunter2')).toContain(REDACTED_MARKER);
    expect(redactSecretLike('API_KEY = "abcdef1234567890"')).toContain(REDACTED_MARKER);
    expect(redactSecretLike('my_token=abcdef123456789')).toContain(REDACTED_MARKER);
  });

  it('preserves non-secret structure so signatures stay parseable (SEC-L)', () => {
    const line = 'export function calculateBudget(input: BudgetInput): ContextBudget';
    expect(redactSecretLike(line)).toBe(line);
    expect(redactSecretLike('method extractOutline(filePath, symbols, maxTokens)')).toBe(
      'method extractOutline(filePath, symbols, maxTokens)'
    );
  });

  it('is idempotent (PBT-09 step 4)', () => {
    const mixed = `sk-live-abcdefgh1234567890 and Password: hunter2hunter2 end`;
    expect(redactSecretLike(redactSecretLike(mixed))).toBe(redactSecretLike(mixed));
  });
});

// STC UT-34 — control-character / zero-width strip (SEC-360-07)
describe('stripControlChars (SEC-360-07)', () => {
  it('strips U+200B, U+202E and C0 controls from signatures', () => {
    const hostile = 'func\u200Btion pay\u202Ement(amount)';
    const out = stripControlChars(hostile);
    expect(out).toBe('function payment(amount)');
    expect(out).not.toMatch(/[\u200B\u202E]/);
    expect(stripControlChars('a\u0000b\u0007c')).toBe('abc');
  });

  it('leaves legitimate ASCII/Unicode identifiers unaffected', () => {
    const line = 'method trảVề(kếtQuả: string): void';
    expect(stripControlChars(line)).toBe(line);
  });

  it('sanitizes end-to-end: secret + zero-width in one line (sanitizeCodeText)', () => {
    const line = 'const K\u200BEY = sk-live-abcdefgh1234567890;';
    const out = sanitizeCodeText(line);
    expect(out).toContain(REDACTED_MARKER);
    expect(out).not.toContain('\u200B');
    expect(out).not.toContain('sk-live-abcdefgh1234567890');
  });
});

// STC UT-31 — secret-file name exclusion from the skeleton corpus walk (SEC-H)
describe('isSecretFileName (SEC-360-01 #2)', () => {
  it('excludes every secret-named fixture file', () => {
    for (const name of ['.env', '.env.local', 'server.pem', 'id_rsa', 'credentials.json', 'api-secret.ts']) {
      expect(isSecretFileName(name)).toBe(true);
    }
  });

  it('keeps normal source files and directories exclusion untouched', () => {
    for (const name of ['index.ts', 'skeleton-provider.ts', 'readme.md', 'keys.config.json']) {
      expect(isSecretFileName(name)).toBe(false);
    }
  });
});
