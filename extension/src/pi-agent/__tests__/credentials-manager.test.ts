import { describe, it, expect } from 'vitest';
import { CredentialsManager, CredentialsError } from '../credentials-manager';

describe('CredentialsManager', () => {
  it('rejects secret hardcode BR-5', () => {
    const mgr = new CredentialsManager();
    expect(() => mgr.set('key', 'sk-actual-secret')).toThrow(CredentialsError);
  });

  it('accepts env reference', () => {
    const mgr = new CredentialsManager();
    expect(() => mgr.set('openai_api_key', 'env:OPENAI_KEY')).not.toThrow();
  });

  it('missing credential blocks session', () => {
    const mgr = new CredentialsManager();
    expect(() => mgr.resolve({ credentialKey: 'missing_key', credentialValueRef: 'env:MISSING' }))
      .toThrow(CredentialsError);
  });

  it('resolves env var', () => {
    process.env.TEST_KEY = 'value123';
    const mgr = new CredentialsManager();
    const val = mgr.resolve({ credentialKey: 'any', credentialValueRef: 'env:TEST_KEY' });
    expect(val).toBe('value123');
    delete process.env.TEST_KEY;
  });
});
