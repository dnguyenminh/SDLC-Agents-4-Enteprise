/**
 * Gateway-model tests — SA4E-289 PI-GATEWAY-MODEL-FIX-CHECKLIST FIX 4.
 * Proves: gateway /v1/models (fetched WITH the API key) populates the registry;
 * the user's "auto" selection is honored as-is (never replaced by a static gpt-* id).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PiWorkflowEngine } from '../pi-workflow.js';
import { createGatewayProvider } from '../pi-gateway-provider.js';
import { fetchGatewayModels } from '../../chat-panel/chat-models.js';
import type { CredentialResolver } from '../pi-provider.js';

vi.mock('../../chat-panel/chat-models', () => ({
  fetchGatewayModels: vi.fn(async (_baseUrl: string, _auth?: string) =>
    (globalThis as any).__gatewayModels ?? null),
}));

const realFetchGatewayModels = vi.mocked(fetchGatewayModels);

describe('createGatewayProvider — real gateway models (SA4E-289 FIX 4)', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    delete (globalThis as any).__gatewayModels;
  });

  afterEach(() => {
    delete (globalThis as any).__gatewayModels;
    delete process.env.NODE_ENV;
  });

  it('builds the registry from the gateway’s REAL model list (incl. auto)', async () => {
    (globalThis as any).__gatewayModels = [{ id: 'auto', name: 'Auto' }, { id: 'gpt-4o', name: 'GPT-4o' }];
    const provider = await createGatewayProvider('openai', 'http://localhost:20128/v1', 'sk-test');

    // Provider models must carry the gateway baseUrl + provider id
    const models = (provider as unknown as { getModels: () => Array<Record<string, unknown>> }).getModels();
    expect(models.map(m => m.id)).toContain('auto');
    expect(models.find(m => m.id === 'auto')?.provider).toBe('openai');
    expect(models.find(m => m.id === 'auto')?.baseUrl).toBe('http://localhost:20128/v1');
    // Fetch must have been called with the Authorization header (gateway requires auth)
    expect(realFetchGatewayModels).toHaveBeenCalledWith('http://localhost:20128/v1', 'Bearer sk-test');
  });

  it('falls back to the static catalog when the gateway list is unavailable (no crash)', async () => {
    (globalThis as any).__gatewayModels = null;
    const provider = await createGatewayProvider('openai', 'http://localhost:20128/v1', 'sk-test');

    const models = (provider as unknown as { getModels: () => Array<Record<string, unknown>> }).getModels();
    expect(models.length).toBeGreaterThan(0);
    // Static catalog entries (gpt-*) present as fallback
    expect(models.some(m => String(m.id).startsWith('gpt-'))).toBe(true);
  });
});

describe('configureProvider — honors "auto" from the gateway registry (SA4E-289 FIX 2/3)', () => {
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

  it('configuredModelId="auto" + gateway registry has auto → sends "auto" as-is (NOT a static gpt-*)', async () => {
    (globalThis as any).__gatewayModels = [{ id: 'auto', name: 'Auto' }, { id: 'gpt-4o', name: 'GPT-4o' }];

    const res = await engine.configureProvider({
      credentialResolver,
      providerId: 'openai',
      configuredModelId: 'auto',
      baseUrl: 'http://localhost:20128/v1',
    });

    expect(res.modelUnresolved).toBe(false);
    expect(res.resolvedModelId).toBe('auto');
  });

  it('configuredModelId="" + gateway list → resolves a gateway model', async () => {
    (globalThis as any).__gatewayModels = [{ id: 'auto', name: 'Auto' }, { id: 'gpt-4o', name: 'GPT-4o' }];

    const res = await engine.configureProvider({
      credentialResolver,
      providerId: 'openai',
      configuredModelId: '',
      baseUrl: 'http://localhost:20128/v1',
    });

    expect(res.modelUnresolved).toBe(false);
    expect(res.resolvedModelId).toBeDefined();
    // Gateway-backed models in the registry
    expect(['auto', 'gpt-4o']).toContain(res.resolvedModelId);
  });
});
