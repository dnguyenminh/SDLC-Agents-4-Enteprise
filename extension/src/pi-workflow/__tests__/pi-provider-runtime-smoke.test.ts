/**
 * Runtime smoke test — SA4E-289 FIX 5.
 * Runs the REAL PiProvider + REAL pi-agent-core Agent (no mocks), with the
 * pi-ai faux provider supplying a deterministic model response.
 *
 * This is the test class that should have caught Bug 1 (PI_NOT_INITIALIZED)
 * and Bug 2 (PI_SDK_UNAVAILABLE — wrong SDK API shape): static/unit tests
 * mock the SDK, so the real runtime path was never exercised until now.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createModels } from '@earendil-works/pi-ai';
import type { MutableModels } from '@earendil-works/pi-ai';
import { fauxProvider, fauxAssistantMessage } from '@earendil-works/pi-ai/providers/faux';
import { PiProvider } from '../pi-provider.js';

describe('PiProvider runtime smoke (real SDK + faux model — SA4E-289)', () => {
  let provider: PiProvider;
  let models: MutableModels;
  let faux: ReturnType<typeof fauxProvider>;

  beforeEach(async () => {
    process.env.NODE_ENV = 'test';
    provider = new PiProvider();
    models = createModels();
    faux = fauxProvider();

    // Register the faux provider into the SHARED Models registry, then inject
    // that same registry into the PiProvider (DI) so its Agent's streamFn
    // resolves the deterministic faux model. faux.provider is a Provider OBJECT;
    // the registry id string is 'faux'.
    models.setProvider(faux.provider);
    faux.setResponses([fauxAssistantMessage('Hello from faux Pi model')]);

    await provider.initialize({ transportType: 'HTTP', models });
    // Resolve the faux model on the Agent (registry id string + model id)
    await provider.setModel('faux', 'faux-1');
  });

  afterEach(() => {
    models.deleteProvider('faux');
    provider.dispose();
    delete process.env.NODE_ENV;
  });

  it('initializes the real Agent without PI_SDK_UNAVAILABLE', async () => {
    expect(provider.sdkAvailable).toBe(true);
  });

  it('run() returns real streamed text from the Agent event loop', async () => {
    const result = await provider.run({ prompt: 'Say hello', provider: 'faux', model: 'faux-1' });

    expect(result.errorMessage).toBeUndefined();
    expect(result.text).toContain('Hello from faux Pi model');
    expect(result.text.length).toBeGreaterThan(0);
    // Streaming events actually arrived (not a silent stub)
    expect(result.chunks.some(c => c.type === 'text')).toBe(true);
    expect(result.chunks[result.chunks.length - 1].type).toBe('done');
  });

  it('stream() compat yields chunks for the same run', async () => {
    const chunks = [];
    for await (const chunk of provider.stream({ prompt: 'Stream test', provider: 'faux', model: 'faux-1' })) {
      chunks.push(chunk);
    }
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].type).toBe('text');
    expect(chunks[chunks.length - 1].type).toBe('done');
  });

  it('prompt→waitForIdle produces transcript messages in agent state', async () => {
    const result = await provider.run({ prompt: 'Transcript test', provider: 'faux', model: 'faux-1' });
    expect(result.messages.length).toBeGreaterThan(0);
    const assistant = result.messages.find(m => (m as { role?: string }).role === 'assistant');
    expect(assistant).toBeDefined();
  });

it('throws PI_NOT_INITIALIZED when run called before initialize', async () => {
    const fresh = new PiProvider();
    await expect(fresh.run({ prompt: 'x' })).rejects.toThrow('PI_NOT_INITIALIZED');
  });
});

describe('PiProvider concurrency — serialized runs (CONCURRENCY-FIX)', () => {
  let provider: PiProvider;
  let models: MutableModels;
  let faux: ReturnType<typeof fauxProvider>;

  beforeEach(async () => {
    process.env.NODE_ENV = 'test';
    provider = new PiProvider();
    models = createModels();

    // Medium-slow faux: runs take a few hundred ms so runs genuinely overlap / abort mid-stream,
    // but stay well under the test timeout.
    faux = fauxProvider({ tokensPerSecond: 50 });
    models.setProvider(faux.provider);

    await provider.initialize({ transportType: 'HTTP', models });
    await provider.setModel('faux', 'faux-1');
  });

  afterEach(() => {
    models.deleteProvider('faux');
    provider.dispose();
    delete process.env.NODE_ENV;
  });

  it('two overlapping run() calls NEVER throw "already processing" — both complete in order', async () => {
    faux.appendResponses([
      fauxAssistantMessage('first response'),
      fauxAssistantMessage('second response'),
    ]);

    // Fire both WITHOUT awaiting the first: this is exactly the overlap that used to throw.
    const p1 = provider.run({ prompt: 'Run A', provider: 'faux', model: 'faux-1' });
    const p2 = provider.run({ prompt: 'Run B', provider: 'faux', model: 'faux-1' });

    const [r1, r2] = await Promise.all([p1, p2]);

    // Serialization guarantee: no overlap error surfaces from either run.
    expect(String(r1.errorMessage ?? '')).not.toContain('already processing');
    expect(String(r2.errorMessage ?? '')).not.toContain('already processing');
    // Both real runs produced their own streamed text (executed sequentially, not dropped).
    expect(r1.text).toContain('first response');
    expect(r2.text).toContain('second response');
    // The provider actually exercised the model twice (serialized, not swallowed).
    expect(faux.state.callCount).toBe(2);
    // Both results were finalized with a done chunk + transcript.
    expect(r1.chunks[r1.chunks.length - 1].type).toBe('done');
    expect(r2.chunks[r2.chunks.length - 1].type).toBe('done');
  });

  it('recovers when the previous run was aborted mid-flight (no stuck activeRun poisons the next run)', async () => {
    faux.setResponses([fauxAssistantMessage('slow aborted run')]);

    // Start a slow run and abort it while it is streaming. Give the (serialized)
    // run a tick to reach agent.prompt() so the abort lands mid-stream.
    const aborted = provider.run({ prompt: 'Abort me', provider: 'faux', model: 'faux-1' });
    await new Promise(r => setTimeout(r, 50));
    provider.abort();
    await aborted.catch(() => {});

    // A new run right after the abort must succeed — no "already processing".
    faux.setResponses([fauxAssistantMessage('recovered response')]);
    const recovered = await provider.run({ prompt: 'Retry', provider: 'faux', model: 'faux-1' });

    expect(String(recovered.errorMessage ?? '')).not.toContain('already processing');
    expect(recovered.text).toContain('recovered response');
  });
});


