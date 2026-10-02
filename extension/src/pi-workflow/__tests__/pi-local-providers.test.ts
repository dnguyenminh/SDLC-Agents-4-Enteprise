/**
 * Local keyless providers — UAT bug: chat demanded kiroSdlc.lmstudioApiKey
 * even though LM Studio serves a keyless local endpoint.
 * Local providers (lmstudio/ollama/onnx) must never block on a missing key;
 * cloud providers keep the fail-closed PI_CREDENTIALS_MISSING path.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { PiWorkflowEngine } from '../pi-workflow.js';
import { providerRequiresApiKey, hintLocalEndpointError } from '../pi-provider-config-bridge.js';
import type { CredentialResolver } from '../pi-provider.js';

describe('providerRequiresApiKey', () => {
  it.each(['lmstudio', 'ollama', 'onnx', 'LMStudio', ' Ollama '])(
    'local provider %s needs no key',
    (id) => expect(providerRequiresApiKey(id)).toBe(false)
  );

  it.each(['anthropic', 'openai', 'openrouter', 'kiro', '', undefined])(
    'provider %s still requires a key',
    (id) => expect(providerRequiresApiKey(id)).toBe(true)
  );
});

describe('hintLocalEndpointError', () => {
  it('appends endpoint checklist for local HTTP errors', () => {
    const out = hintLocalEndpointError(
      'HTTP 401: Authentication required',
      'lmstudio',
      'http://localhost:1234/v1',
      'qwen-text'
    );
    expect(out).toContain('HTTP 401: Authentication required');
    expect(out).toContain('http://localhost:1234/v1');
    expect(out).toContain('qwen-text');
    expect(out).toContain('model is LOADED');
  });

  it('leaves cloud provider errors untouched', () => {
    const msg = 'HTTP 401: Authentication required';
    expect(hintLocalEndpointError(msg, 'anthropic', undefined, undefined)).toBe(msg);
  });

  it('leaves non-HTTP errors untouched', () => {
    const msg = 'boom';
    expect(hintLocalEndpointError(msg, 'lmstudio', 'http://x', 'm')).toBe(msg);
  });
});

describe('configureProvider — keyless local providers do not block', () => {
  const engines: PiWorkflowEngine[] = [];
  afterEach(() => {
    for (const e of engines.splice(0)) e.getProvider().dispose();
    delete process.env.NODE_ENV;
  });

  it('lmstudio + no key → credentialsPresent=true', async () => {
    process.env.NODE_ENV = 'test';
    const engine = new PiWorkflowEngine();
    engines.push(engine);
    const noKey: CredentialResolver = async () => undefined;
    const res = await engine.configureProvider({
      credentialResolver: noKey,
      providerId: 'lmstudio',
      configuredModelId: '',
    });
    expect(res.credentialsPresent).toBe(true);
  });

  it('lmstudio + no key + local baseUrl → gateway models resolve, turn unblocked', async () => {
    process.env.NODE_ENV = 'test';
    const engine = new PiWorkflowEngine();
    engines.push(engine);
    const noKey: CredentialResolver = async () => undefined;
    const res = await engine.configureProvider({
      credentialResolver: noKey,
      providerId: 'lmstudio',
      configuredModelId: '',
      baseUrl: 'http://localhost:1234/v1',
    });
    // Unreachable endpoint falls back to the static OpenAI-compatible catalog
    // with the baseUrl override — model resolves, credentials pass keyless.
    expect(res.credentialsPresent).toBe(true);
    expect(res.modelUnresolved).toBe(false);
    expect(res.resolvedModelId).toBeDefined();
  });

  it('anthropic + no key → credentialsPresent=false (fail-closed kept)', async () => {
    process.env.NODE_ENV = 'test';
    const engine = new PiWorkflowEngine();
    engines.push(engine);
    const noKey: CredentialResolver = async () => undefined;
    const res = await engine.configureProvider({
      credentialResolver: noKey,
      providerId: 'anthropic',
      configuredModelId: '',
    });
    expect(res.credentialsPresent).toBe(false);
  });
});
