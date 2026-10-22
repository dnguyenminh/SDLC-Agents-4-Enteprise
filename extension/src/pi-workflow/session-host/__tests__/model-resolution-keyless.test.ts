/**
 * SA4E-369 UAT root-cause fix — model-resolution for keyless LOCAL providers.
 * The session host now serves lmstudio/ollama/onnx: LOCAL_KEYLESS_PLACEHOLDER
 * auth + the shared createGatewayProvider builder registered NATIVELY (real
 * /v1/models). Cloud providers keep the exact pre-fix behavior.
 * STC mapping: SIT-01/02 precondition (peer tools need a session host; a
 * session host needs a resolved model — this file proves model resolution
 * for the local path).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mocks } = vi.hoisted(() => {
  const mocks = {
    fetchGatewayModels: vi.fn(),
    createGatewayProvider: vi.fn(),
    runtime: undefined as undefined | Record<string, ReturnType<typeof vi.fn>>,
  };
  return { mocks };
});

vi.mock('vscode', () => ({}));
vi.mock('../../../debug-logger', () => ({ debugLog: vi.fn(), debugError: vi.fn() }));
vi.mock('../../../chat-panel/chat-models.js', () => ({
  fetchGatewayModels: (...args: unknown[]) => mocks.fetchGatewayModels(...args),
}));
vi.mock('../../pi-gateway-provider.js', () => ({
  createGatewayProvider: (...args: unknown[]) => mocks.createGatewayProvider(...args),
}));

import { createModelRuntime } from '../model-resolution.js';

const GATEWAY_MODELS = [
  { id: 'qwen2.5-coder-7b-instruct', name: 'Qwen2.5 Coder 7B', contextWindow: 65536 },
  { id: 'llama-3.1-8b-instruct', name: 'Llama 3.1 8B', contextWindow: 131072 },
];

/** Fake ModelRuntime — registry keyed by providerId, all calls captured. */
function makeRuntime(catalogModels: Array<{ id: string }>) {
  const runtime = {
    setRuntimeApiKey: vi.fn(async () => undefined),
    registerProvider: vi.fn(),
    registerNativeProvider: vi.fn(),
    getModels: vi.fn((_providerId?: string) => catalogModels),
    getModel: vi.fn((_providerId: string, modelId: string) =>
      catalogModels.find((m) => m.id === modelId)
    ),
  };
  mocks.runtime = runtime;
  return runtime;
}

const piCoding = {
  ModelRuntime: {
    create: async () => mocks.runtime,
  },
} as never;

function lmstudioOpts(overrides?: Record<string, unknown>) {
  return {
    workspaceRoot: '/ws',
    providerId: 'lmstudio',
    baseUrl: 'http://localhost:1234/v1',
    configuredModelId: '',
    ...overrides,
  } as Parameters<typeof createModelRuntime>[1];
}

describe('createModelRuntime — keyless local providers (SA4E-369 UAT fix)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createGatewayProvider.mockResolvedValue({ id: 'gateway-stub' });
  });

  it('LOCAL-01: lmstudio + gateway models → keyless placeholder auth + NATIVE gateway provider + model resolved', async () => {
    makeRuntime(GATEWAY_MODELS);
    mocks.fetchGatewayModels.mockResolvedValue(GATEWAY_MODELS);

    const { model } = await createModelRuntime(piCoding, lmstudioOpts());

    // Keyless auth is seeded with the documented placeholder (LM Studio
    // ignores the header value — UAT bug: chat demanded an API key).
    expect(mocks.runtime.setRuntimeApiKey).toHaveBeenCalledWith('lmstudio', 'keyless-local');
    // The FULL gateway provider (real /v1/models) is registered NATIVELY —
    // a bare {baseUrl} config carries no models for custom provider ids.
    expect(mocks.runtime.registerNativeProvider).toHaveBeenCalledTimes(1);
    expect(mocks.createGatewayProvider).toHaveBeenCalledWith(
      'lmstudio',
      'http://localhost:1234/v1',
      undefined,
      GATEWAY_MODELS // preloaded entries — no double /v1/models fetch
    );
    // Model resolved from the gateway registry (first entry — no sonnet/opus match).
    expect((model as { id: string }).id).toBe('qwen2.5-coder-7b-instruct');
    expect(mocks.runtime.registerProvider).not.toHaveBeenCalled();
  });

  it('LOCAL-02: gateway unreachable (no models listed) → PI_MODEL_UNRESOLVED (legacy fallback owns the hint)', async () => {
    makeRuntime([]);
    mocks.fetchGatewayModels.mockResolvedValue([]);

    await expect(createModelRuntime(piCoding, lmstudioOpts())).rejects.toThrow(/PI_MODEL_UNRESOLVED/);
    expect(mocks.createGatewayProvider).not.toHaveBeenCalled();
  });

  it('LOCAL-03: keyless provider WITHOUT baseUrl → PI_MODEL_UNRESOLVED (no silent cross-provider model)', async () => {
    makeRuntime([]);
    await expect(
      createModelRuntime(piCoding, lmstudioOpts({ baseUrl: undefined }))
    ).rejects.toThrow(/no models for keyless provider 'lmstudio'/);
  });

  it('LOCAL-04: configured model id wins when the gateway lists it', async () => {
    makeRuntime(GATEWAY_MODELS);
    mocks.fetchGatewayModels.mockResolvedValue(GATEWAY_MODELS);

    const { model } = await createModelRuntime(
      piCoding,
      lmstudioOpts({ configuredModelId: 'llama-3.1-8b-instruct' })
    );
    expect((model as { id: string }).id).toBe('llama-3.1-8b-instruct');
  });

  it('LOCAL-05: user-set lmstudio API key (optional) is used instead of the placeholder', async () => {
    makeRuntime(GATEWAY_MODELS);
    mocks.fetchGatewayModels.mockResolvedValue(GATEWAY_MODELS);

    await createModelRuntime(piCoding, lmstudioOpts({ apiKey: 'sk-local' }));
    expect(mocks.runtime.setRuntimeApiKey).toHaveBeenCalledWith('lmstudio', 'sk-local');
  });
});

describe('createModelRuntime — cloud providers unchanged (regression guard)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('CLOUD-01: anthropic + key + baseUrl → real key seeded, config-level registerProvider, NO native gateway', async () => {
    makeRuntime([{ id: 'claude-sonnet-4' }]);

    const { model } = await createModelRuntime(piCoding, {
      workspaceRoot: '/ws',
      providerId: 'anthropic',
      apiKey: 'sk-ant',
      baseUrl: 'https://gw.example.com',
      configuredModelId: '',
    } as Parameters<typeof createModelRuntime>[1]);

    expect(mocks.runtime.setRuntimeApiKey).toHaveBeenCalledWith('anthropic', 'sk-ant');
    expect(mocks.runtime.registerProvider).toHaveBeenCalledWith('anthropic', { baseUrl: 'https://gw.example.com' });
    expect(mocks.runtime.registerNativeProvider).not.toHaveBeenCalled();
    expect(mocks.fetchGatewayModels).not.toHaveBeenCalled();
    expect((model as { id: string }).id).toBe('claude-sonnet-4');
  });

  it('CLOUD-02: registerProvider failure stays swallowed for cloud (pre-fix fail-open)', async () => {
    const runtime = makeRuntime([{ id: 'claude-sonnet-4' }]);
    runtime.registerProvider.mockImplementation(() => {
      throw new Error('boom');
    });

    const { model } = await createModelRuntime(piCoding, {
      workspaceRoot: '/ws',
      providerId: 'anthropic',
      apiKey: 'sk-ant',
      baseUrl: 'https://gw.example.com',
      configuredModelId: '',
    } as Parameters<typeof createModelRuntime>[1]);

    expect((model as { id: string }).id).toBe('claude-sonnet-4');
  });
});
