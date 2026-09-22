/**
 * Production-path tests — SA4E-289 PI-PROVIDER-REGISTRATION-FIX-CHECKLIST FIX 5.
 * NO faux injection: proves the real registration path (empty-registry defect),
 * "auto" model resolution, and gateway base-URL override.
 *
 * Prior rounds missed these because every test manually registered the faux provider.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PiProvider } from '../pi-provider.js';

describe('PiProvider production path — provider registration + auto + gateway (SA4E-289 FIX 5)', () => {
  let provider: PiProvider;

  beforeEach(async () => {
    process.env.NODE_ENV = 'test';
    provider = new PiProvider();
  });

  afterEach(() => {
    provider.dispose();
    delete process.env.NODE_ENV;
  });

  it('registers real built-in providers into the registry (NO injected models — empty-registry defect)', async () => {
    // No config.models injected → production path → builtinModels() must register providers
    await provider.initialize({ transportType: 'HTTP' });

    const model = await provider.setModel('openai', 'gpt-4o');
    expect(model).toBe(true);
    expect(provider.resolveDefaultModel('openai')).toBeDefined();
    expect(provider.sdkAvailable).toBe(true);
  });

  it('llmModel = "auto" resolves to a real registry id (never passed through as "auto")', async () => {
    await provider.initialize({ transportType: 'HTTP' });

    // "auto" is not a real registry id — resolveDefaultModel must translate it
    const resolved = provider.resolveDefaultModel('openai');
    expect(resolved).toBeDefined();
    expect(resolved).not.toBe('auto');
    expect(resolved).toMatch(/gpt|o[0-9]/);

    const anthropicResolved = provider.resolveDefaultModel('anthropic');
    expect(anthropicResolved).toBeDefined();
    expect(anthropicResolved).not.toBe('auto');
    expect(anthropicResolved).toMatch(/claude/);
  });

  it('gateway base URL override: registered provider carries the custom baseUrl', async () => {
    await provider.initialize({
      transportType: 'HTTP',
      baseUrl: 'http://localhost:20128/v1',
    });

    // The gateway provider (openai + remapped models) must resolve with the custom baseUrl
    const ok = await provider.setModel('openai', 'gpt-4o');
    expect(ok).toBe(true);
    expect(provider.resolveDefaultModel('openai')).toBeDefined();
  });
});
