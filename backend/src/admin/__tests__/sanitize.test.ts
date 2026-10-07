/**
 * SA4E-338 S4 — sharing helpers for secret masking (D-SEC-06; supports STC UT-57).
 */
import { describe, it, expect } from 'vitest';
import { maskSecret, isSecretConfigKey, MASKED_VALUE } from '../sanitize.js';

describe('maskSecret', () => {
  it('masks present values with ***', () => {
    expect(maskSecret('sk-live-abc123')).toBe('***');
    expect(maskSecret('"***"')).toBe('***');
  });

  it('returns empty string for empty/absent values', () => {
    expect(maskSecret('')).toBe('');
    expect(maskSecret(null)).toBe('');
    expect(maskSecret(undefined)).toBe('');
  });

  it('exposes the *** sentinel shared by API/history/audit masking', () => {
    expect(MASKED_VALUE).toBe('***');
  });
});

describe('isSecretConfigKey', () => {
  it('flags llm.apiKey and auth.entraClientSecret', () => {
    expect(isSecretConfigKey('llm', 'apiKey')).toBe(true);
    expect(isSecretConfigKey('auth', 'entraClientSecret')).toBe(true);
  });

  it('does not flag non-secret keys', () => {
    expect(isSecretConfigKey('llm', 'model')).toBe(false);
    expect(isSecretConfigKey('llm', 'baseUrl')).toBe(false);
    expect(isSecretConfigKey('auth', 'entraClientId')).toBe(false);
    expect(isSecretConfigKey('taskWorker', 'concurrency')).toBe(false);
  });
});
