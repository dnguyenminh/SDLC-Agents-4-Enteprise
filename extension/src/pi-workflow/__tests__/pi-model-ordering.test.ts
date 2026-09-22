/**
 * Real-registry ordering tests — SA4E-289 PI-MODEL-ORDERING-FIX-CHECKLIST FIX D.
 * Exercises PiWorkflowEngine.configureProvider with the REAL builtinModels() registry
 * (no faux injection): init → seed creds → gateway → resolve default → setModel.
 *
 * Prior tests injected a faux registry AND set the model explicitly, so the ordering
 * bug (resolve-before-init returning undefined) was never exercised.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PiWorkflowEngine } from '../pi-workflow.js';
import type { CredentialResolver } from '../pi-provider.js';

describe('PiWorkflowEngine.configureProvider — real registry ordering (SA4E-289 FIX D)', () => {
  let engine: PiWorkflowEngine;
  let credentialResolver: CredentialResolver;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    engine = new PiWorkflowEngine();
    credentialResolver = async () => 'sk-test-key';
  });

  afterEach(() => {
    engine.getProvider().dispose();
    delete process.env.NODE_ENV;
  });

  it('configuredModelId="auto" resolves to a real OpenAI id AFTER init+gateway (ordering fixed)', async () => {
    const res = await engine.configureProvider({
      credentialResolver,
      providerId: 'openai',
      configuredModelId: 'auto',
      baseUrl: 'http://localhost:20128/v1',
    });

    expect(res.modelUnresolved).toBe(false);
    expect(res.resolvedModelId).toBeDefined();
    expect(res.resolvedModelId).not.toBe('auto');
    expect(res.resolvedModelId).toMatch(/gpt-4o|gpt-4\.1|gpt-5/);
    expect(res.credentialsPresent).toBe(true);
  });

  it('configuredModelId="" resolves a default too', async () => {
    const res = await engine.configureProvider({
      credentialResolver,
      providerId: 'openai',
      configuredModelId: '',
    });

    expect(res.modelUnresolved).toBe(false);
    expect(res.resolvedModelId).toBeDefined();
    expect(res.resolvedModelId).toMatch(/gpt|o[0-9]/);
  });

  it('gateway: baseUrl + providerId=openai → provider registered under "openai", default model resolves', async () => {
    const res = await engine.configureProvider({
      credentialResolver,
      providerId: 'openai',
      configuredModelId: 'auto',
      baseUrl: 'http://localhost:20128/v1',
    });

    expect(res.modelUnresolved).toBe(false);
    expect(res.resolvedModelId).toMatch(/gpt-4o|gpt-4\.1|gpt-5/);
  });

  it('truly unknown provider id → modelUnresolved=true (the only PI_MODEL_UNRESOLVED case)', async () => {
    const res = await engine.configureProvider({
      credentialResolver,
      providerId: 'no-such-provider-xyz',
      configuredModelId: 'auto',
    });

    expect(res.modelUnresolved).toBe(true);
  });

  it('missing credentials (resolver yields undefined) → credentialsPresent=false, model still resolves', async () => {
    const noKeyResolver: CredentialResolver = async () => undefined;
    const res = await engine.configureProvider({
      credentialResolver: noKeyResolver,
      providerId: 'openai',
      configuredModelId: 'auto',
    });

    // FIX C: model resolves for a registered provider even without a key
    expect(res.modelUnresolved).toBe(false);
    expect(res.credentialsPresent).toBe(false);
  });
});
