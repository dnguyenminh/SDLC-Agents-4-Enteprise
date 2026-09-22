/**
 * PI-MODEL-FALLBACK tests (SA4E-289).
 *
 * Verifies that PiProvider retries the SAME prompt on the next model in the
 * fallback chain when a run fails with a TRANSIENT gateway error, stops on the
 * first success, and does NOT fall back on non-retryable (4xx) errors.
 *
 * Uses the REAL PiProvider + REAL pi-agent-core Agent with a multi-model faux
 * provider whose response factory throws for "broken" models and succeeds for
 * healthy ones — mirroring an OmniRoute gateway with mixed-health upstreams.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createModels } from '@earendil-works/pi-ai';
import type { MutableModels } from '@earendil-works/pi-ai';
import { fauxProvider, fauxAssistantMessage } from '@earendil-works/pi-ai/providers/faux';
import { PiProvider } from '../pi-provider.js';
import { isRetryableLlmError, extractStatus } from '../utils/classify-llm-error.js';

const PROVIDER = 'faux';

type FauxFactory = (ctx: unknown, opts: unknown, state: unknown, model: { id: string }) => ReturnType<typeof fauxAssistantMessage>;

/** A faux response factory that throws `error` when the active model matches `brokenId`. */
function breakModel(brokenId: string, error: Error, okText: string): FauxFactory {
  return (_ctx, _opts, _state, model) => {
    if (model.id === brokenId) throw error;
    return fauxAssistantMessage(okText);
  };
}

/**
 * Repeat a per-model routing factory `n` times. Each faux response STEP is
 * consumed once, but the fallback loop makes one upstream call PER model, so we
 * queue enough identical steps to cover every attempt in the chain.
 */
function times(factory: FauxFactory, n: number): FauxFactory[] {
  return Array.from({ length: n }, () => factory);
}

describe('PiProvider model fallback (SA4E-289 PI-MODEL-FALLBACK)', () => {
  let provider: PiProvider;
  let models: MutableModels;
  let faux: ReturnType<typeof fauxProvider>;

  beforeEach(async () => {
    process.env.NODE_ENV = 'test';
    provider = new PiProvider();
    models = createModels();
    // Three models: primary (broken), and two healthy fallbacks.
    faux = fauxProvider({
      models: [{ id: 'primary' }, { id: 'fallback-a' }, { id: 'fallback-b' }],
    });
    models.setProvider(faux.provider);
    await provider.initialize({ transportType: 'HTTP', models });
    await provider.setModel(PROVIDER, 'primary');
  });

  afterEach(() => {
    models.deleteProvider(PROVIDER);
    provider.dispose();
    delete process.env.NODE_ENV;
  });

  it('falls back to the next model on a transient 500 "bridge sandbox" error', async () => {
    provider.setFallbackModels(PROVIDER, ['primary', 'fallback-a', 'fallback-b']);
    // primary always fails with the exact Devin bridge error the user hit.
    faux.setResponses(times(
      breakModel('primary', new Error('OpenAI API error (500): DEVIN_AGENTIC_HOME must be an absolute path inside the bridge sandbox'), 'recovered on A'),
      2
    ));

    const result = await provider.run({ prompt: 'hi', provider: PROVIDER, model: 'primary' });

    expect(result.errorMessage).toBeUndefined();
    expect(result.text).toContain('recovered on A');
    // primary threw, fallback-a succeeded → exactly 2 upstream calls.
    expect(faux.state.callCount).toBe(2);
  });

  it('skips a broken fallback and continues to the next healthy one', async () => {
    provider.setFallbackModels(PROVIDER, ['primary', 'fallback-a', 'fallback-b']);
    const route: FauxFactory = (_c, _o, _s, model) => {
      if (model.id === 'primary') throw new Error('503 Service Unavailable');
      if (model.id === 'fallback-a') throw new Error('gateway timeout');
      return fauxAssistantMessage('recovered on B');
    };
    faux.setResponses(times(route, 3));

    const result = await provider.run({ prompt: 'hi', provider: PROVIDER, model: 'primary' });

    expect(result.errorMessage).toBeUndefined();
    expect(result.text).toContain('recovered on B');
    expect(faux.state.callCount).toBe(3);
  });

  it('does NOT fall back on a non-retryable 400 error (fails fast on primary)', async () => {
    provider.setFallbackModels(PROVIDER, ['primary', 'fallback-a']);
    faux.setResponses([
      breakModel('primary', new Error('OpenAI API error (400): invalid request'), 'should not reach A'),
    ]);

    const result = await provider.run({ prompt: 'hi', provider: PROVIDER, model: 'primary' });

    expect(result.errorMessage).toContain('400');
    expect(result.text).not.toContain('should not reach A');
    // Only the primary was attempted — no wasted fallback call.
    expect(faux.state.callCount).toBe(1);
  });

  it('returns the last error when the entire chain fails transiently', async () => {
    provider.setFallbackModels(PROVIDER, ['primary', 'fallback-a', 'fallback-b']);
    const alwaysFail: FauxFactory = () => { throw new Error('500 internal server error'); };
    faux.setResponses(times(alwaysFail, 3));

    const result = await provider.run({ prompt: 'hi', provider: PROVIDER, model: 'primary' });

    expect(result.errorMessage).toContain('500');
    // Every model in the chain was tried once.
    expect(faux.state.callCount).toBe(3);
  });

  it('succeeds on the primary without touching fallbacks when it is healthy', async () => {
    provider.setFallbackModels(PROVIDER, ['primary', 'fallback-a']);
    faux.setResponses([fauxAssistantMessage('primary is fine')]);

    const result = await provider.run({ prompt: 'hi', provider: PROVIDER, model: 'primary' });

    expect(result.errorMessage).toBeUndefined();
    expect(result.text).toContain('primary is fine');
    expect(faux.state.callCount).toBe(1);
  });

  it('drops unknown fallback ids that are not in the registry', async () => {
    // 'ghost-model' does not exist → must be filtered out, real ones kept.
    provider.setFallbackModels(PROVIDER, ['primary', 'ghost-model', 'fallback-a']);
    faux.setResponses(times(
      breakModel('primary', new Error('502 bad gateway'), 'recovered after ghost skipped'),
      2
    ));

    const result = await provider.run({ prompt: 'hi', provider: PROVIDER, model: 'primary' });

    expect(result.errorMessage).toBeUndefined();
    expect(result.text).toContain('recovered after ghost skipped');
    // primary (throw) + fallback-a (ok) = 2; ghost-model never called.
    expect(faux.state.callCount).toBe(2);
  });
});

describe('isRetryableLlmError classifier (SA4E-289)', () => {
  it('treats 5xx / 408 / 429 as retryable', () => {
    expect(isRetryableLlmError(new Error('OpenAI API error (500): boom'))).toBe(true);
    expect(isRetryableLlmError(new Error('503 Service Unavailable'))).toBe(true);
    expect(isRetryableLlmError({ status: 429 })).toBe(true);
    expect(isRetryableLlmError({ status: 408 })).toBe(true);
  });

  it('treats the Devin bridge sandbox 500 as retryable', () => {
    expect(isRetryableLlmError(new Error('DEVIN_AGENTIC_HOME must be an absolute path inside the bridge sandbox'))).toBe(true);
  });

  it('treats timeouts / network errors as retryable', () => {
    expect(isRetryableLlmError(new Error('The request was canceled due to the configured HttpClient.Timeout'))).toBe(true);
    expect(isRetryableLlmError(new Error('fetch failed'))).toBe(true);
    expect(isRetryableLlmError({ code: 'ECONNRESET', message: 'socket hang up' })).toBe(true);
  });

  it('treats 4xx client errors (except 408/429) as NON-retryable', () => {
    expect(isRetryableLlmError(new Error('OpenAI API error (400): bad request'))).toBe(false);
    expect(isRetryableLlmError({ status: 401 })).toBe(false);
    expect(isRetryableLlmError({ status: 403 })).toBe(false);
    expect(isRetryableLlmError({ status: 404 })).toBe(false);
  });

  it('extractStatus reads status from message, .status, and .response.status', () => {
    expect(extractStatus(new Error('error (500): x'))).toBe(500);
    expect(extractStatus({ status: 429 })).toBe(429);
    expect(extractStatus({ response: { status: 503 } })).toBe(503);
    expect(extractStatus(new Error('plain error'))).toBeUndefined();
  });
});
