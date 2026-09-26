import { describe, it, expect, beforeEach } from 'vitest';
import { SsoStrategyRegistry } from '../SsoStrategyRegistry.js';
import type { SsoProviderStrategy, AuthorizeResult, CallbackParams } from '../SsoProviderStrategy.js';
import type { NormalizedProfile } from '../../models/NormalizedProfile.js';

class MockStrategy implements SsoProviderStrategy {
  constructor(readonly providerType: string) {}

  buildAuthorizeUrl(): AuthorizeResult {
    return {
      url: `https://auth.${this.providerType}.com/authorize`,
      state: 'mock-state',
      nonce: 'mock-nonce',
      codeVerifier: 'mock-verifier',
    };
  }

  async handleCallback(_params: CallbackParams): Promise<NormalizedProfile> {
    return {
      provider: this.providerType,
      externalSubjectId: 'sub-123',
      email: `user@${this.providerType}.com`,
      emailVerified: true,
      name: `Mock ${this.providerType} User`,
    };
  }
}

describe('SsoStrategyRegistry', () => {
  let registry: SsoStrategyRegistry;

  beforeEach(() => {
    registry = new SsoStrategyRegistry();
  });

  it('registers and retrieves strategies case-insensitively', () => {
    const googleStrategy = new MockStrategy('google');
    registry.register(googleStrategy);

    expect(registry.has('google')).toBe(true);
    expect(registry.has('GOOGLE')).toBe(true);
    expect(registry.get('google')).toBe(googleStrategy);
    expect(registry.get('Google')).toBe(googleStrategy);
  });

  it('returns undefined for unregistered provider', () => {
    expect(registry.has('unknown')).toBe(false);
    expect(registry.get('unknown')).toBeUndefined();
  });

  it('lists registered provider types', () => {
    registry.register(new MockStrategy('google'));
    registry.register(new MockStrategy('github'));

    const list = registry.list();
    expect(list).toContain('google');
    expect(list).toContain('github');
    expect(list.length).toBe(2);
  });

  it('clears all registered strategies', () => {
    registry.register(new MockStrategy('google'));
    expect(registry.list().length).toBe(1);

    registry.clear();
    expect(registry.list().length).toBe(0);
    expect(registry.has('google')).toBe(false);
  });

  it('maintains singleton instance via getInstance()', () => {
    const inst1 = SsoStrategyRegistry.getInstance();
    const inst2 = SsoStrategyRegistry.getInstance();
    expect(inst1).toBe(inst2);
  });
});
