/**
 * SA4E-338 S3 — Provider HTTP error redaction at construct (TDD §7.4 / D-SEC-07..09).
 * Traces: TC-SEC-07a (scrub + ≤200 cap, no secret in message), TC-SEC-07d (classification
 * unchanged), STC UT-55. providerBody (≤2000) is classification-only — never in message.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildProviderHttpError, scrubSecrets, ErrorClassifier } from '../error-classifier.js';
import { OllamaAdapter } from '../ollama-adapter.js';
import { OpenAIAdapter } from '../openai-adapter.js';
import type { LLMConfig } from '../types.js';

const SECRET = 'sk-secret123';

/** Stub global fetch returning a fixed status + body. */
function stubFetch(status: number, body: string): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status })));
}

afterEach(() => vi.unstubAllGlobals());

describe('buildProviderHttpError (UT-55 / TC-SEC-07a)', () => {
  it('scrubs secrets, caps message at 200 chars, keeps providerBody classification-only', () => {
    const rawBody = `Authorization: Bearer ${SECRET} ` + 'x'.repeat(3000);
    const err = buildProviderHttpError('OpenAI', 401, rawBody);

    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(401);
    expect(err.kind).toBe('auth');
    expect(err.message.length).toBeLessThanOrEqual(200);
    expect(err.message).toMatch(/authorization \*\*\*/i);
    expect(err.message).not.toContain(SECRET);
    // providerBody present (≤2000), far larger than message → raw body never leaks into message
    expect(typeof err.providerBody).toBe('string');
    expect(err.providerBody!.length).toBeLessThanOrEqual(2000);
    expect(err.providerBody!.length).toBeGreaterThan(200);
    expect(err.message).not.toContain('x'.repeat(300));
  });

  it('handles a missing body — no providerBody, no crash, message still bounded', () => {
    const err = buildProviderHttpError('Ollama', 500);
    expect(err.providerBody).toBeUndefined();
    expect(err.message.length).toBeLessThanOrEqual(200);
    expect(err.kind).toBe('transient');
  });

  it('classifies from status: 404 → not_found, 403 → auth, 429 → transient (TC-SEC-07d)', () => {
    expect(buildProviderHttpError('P', 404, 'no such model').kind).toBe('not_found');
    expect(buildProviderHttpError('P', 403, 'forbidden').kind).toBe('auth');
    expect(buildProviderHttpError('P', 429, 'busy').kind).toBe('transient');
  });

  it('still recognises context-length shapes on providerBody (TC-SEC-07d)', () => {
    const body = JSON.stringify({ error: { code: 'context_length_exceeded', message: 'too long' } });
    expect(buildProviderHttpError('OpenAI', 400, body).kind).toBe('context_length');
  });
});

describe('scrubSecrets (D-SEC-07 pattern)', () => {
  it('scrubs keyword+value variants case-insensitively', () => {
    expect(scrubSecrets('api_key=sk-abc123')).toBe('api_key ***');
    expect(scrubSecrets('API-KEY: sk-abc123')).toBe('API-KEY ***');
    expect(scrubSecrets('token: t-1')).toBe('token ***');
    expect(scrubSecrets('Authorization: Bearer sk-secret123 rest')).toBe('Authorization *** rest');
    expect(scrubSecrets('Bearer sk-xyz')).toBe('Bearer ***');
  });

  it('leaves ordinary error text untouched', () => {
    expect(scrubSecrets('model not found')).toBe('model not found');
    expect(scrubSecrets('')).toBe('');
  });
});

describe('ErrorClassifier.toTaskMessage (D-SEC-08/10)', () => {
  it('caps at 200 chars and scrubs secrets for both terminal prefixes', () => {
    const err = new Error(`auth failed token: t-secret ${'y'.repeat(500)}`);
    const auth = ErrorClassifier.toTaskMessage('auth', err);
    expect(auth.startsWith('llm_auth: ')).toBe(true);
    expect(auth.length).toBeLessThanOrEqual(200);
    expect(auth).not.toContain('t-secret');

    const budget = ErrorClassifier.toTaskMessage('context_length', new Error('z'.repeat(500)));
    expect(budget.startsWith('budget_error:')).toBe(true);
    expect(budget.length).toBeLessThanOrEqual(200);
  });
});

describe('adapter integration — errors leave the adapter redacted (UT-55)', () => {
  it('OllamaAdapter throws a redacted ProviderHttpError on 401', async () => {
    stubFetch(401, `Authorization: Bearer ${SECRET} ${'z'.repeat(1000)}`);
    const config: LLMConfig = { provider: 'ollama', model: 'm', baseUrl: 'http://localhost:11434' };

    let caught: any;
    try {
      await new OllamaAdapter().complete([{ role: 'user', content: 'hi' }], config);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught.status).toBe(401);
    expect(caught.kind).toBe('auth');
    expect(caught.message.length).toBeLessThanOrEqual(200);
    expect(caught.message).not.toContain(SECRET);
    expect(typeof caught.providerBody).toBe('string');
  });

  it('OpenAIAdapter throws a redacted ProviderHttpError on 401', async () => {
    stubFetch(401, `Authorization: Bearer ${SECRET} ${'z'.repeat(1000)}`);
    const config: LLMConfig = { provider: 'openai', model: 'm', baseUrl: 'http://localhost:8080/v1', apiKey: SECRET };

    let caught: any;
    try {
      await new OpenAIAdapter().complete([{ role: 'user', content: 'hi' }], config);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught.status).toBe(401);
    expect(caught.message.length).toBeLessThanOrEqual(200);
    expect(caught.message).not.toContain(SECRET);
  });
});
