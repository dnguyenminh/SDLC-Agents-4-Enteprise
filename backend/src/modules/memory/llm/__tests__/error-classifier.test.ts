/**
 * Unit tests — ErrorClassifier / isContextLengthError (SA4E-338 A2).
 * Covers UT-12..UT-16 from STC.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isContextLengthError, classifyError, toTaskMessage, attachProviderError } from '../error-classifier.js';

describe('isContextLengthError', () => {
  // UT-12: context-length recognized by message regex set
  it('UT-12: recognizes 5 context-length message wordings', () => {
    const cases = [
      new Error('context length exceeded'),
      new Error('maximum context length reached'),
      new Error('prompt is too long: 9000 > 8192'),
      new Error('exceeds the maximum context window'),
      new Error('num_ctx exceeds'),
    ];
    for (const err of cases) {
      expect(isContextLengthError(err)).toBe(true);
    }
  });

  // UT-13: recognized by body error.code
  it('UT-13: recognizes error.code=context_length_exceeded (OpenAI/vLLM)', () => {
    const openaiErr = new Error('OpenAI error: 400 {"error":{"code":"context_length_exceeded","message":"..."}}');
    (openaiErr as any).providerBody = '{"error":{"code":"context_length_exceeded","message":"..."}}';

    const vllmErr = new Error('vLLM error: 400 {"object":"error","code":"context_length_exceeded"}');
    (vllmErr as any).providerBody = '{"object":"error","code":"context_length_exceeded"}';

    expect(isContextLengthError(openaiErr)).toBe(true);
    expect(isContextLengthError(vllmErr)).toBe(true);
  });

  // UT-14: negatives — non-context errors never classified as context_length
  it('UT-14: negatives never classified as context_length', () => {
    const nonContext = [
      Object.assign(new Error('LLM server returned 401'), { status: 401 }),
      Object.assign(new Error('LLM server returned 403'), { status: 403 }),
      Object.assign(new Error('LLM server returned 404'), { status: 404 }),
      Object.assign(new Error('LLM server returned 429'), { status: 429 }),
      Object.assign(new Error('LLM server returned 503 without context wording'), { status: 503 }),
      Object.assign(new Error('fetch failed'), { code: 'ECONNREFUSED' }), // connectivity
      new Error('JSON parse error'),
      null,
      undefined,
      'not an error',
    ];
    for (const err of nonContext) {
      expect(isContextLengthError(err)).toBe(false, `expected false for: ${String(err)}`);
    }
  });

  // UT-15: purity — no mutation
  it('UT-15: purity — does not mutate the error', () => {
    const err = new Error('prompt is too long');
    const originalMessage = err.message;
    isContextLengthError(err);
    expect(err.message).toBe(originalMessage);
  });

  // UT-16: classification matrix routes
  it('UT-16: classify routes correctly', () => {
    expect(classifyError(new Error('prompt is too long'))).toBe('context_length');
    expect(classifyError(Object.assign(new Error('401'), { status: 401 }))).toBe('auth');
    expect(classifyError(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }))).toBe('connectivity');
    expect(classifyError(Object.assign(new Error('429'), { status: 429 }))).toBe('transient');
    expect(classifyError(Object.assign(new Error('model not found'), { status: 404 }))).toBe('not_found');
    expect(classifyError(new Error('something weird'))).toBe('unknown');
    expect(classifyError(null)).toBe('unknown');
  });
});

describe('toTaskMessage', () => {
  it('prefixes context_length and auth correctly', () => {
    expect(toTaskMessage('context_length', new Error('ctx err'))).toBe('context_length_error: ctx err');
    expect(toTaskMessage('auth', new Error('auth err'))).toBe('llm_auth: auth err');
    expect(toTaskMessage('transient', new Error('tmp err'))).toBe('llm_transient: tmp err');
    expect(toTaskMessage('connectivity', new Error('conn err'))).toBe('llm_connectivity: conn err');
    expect(toTaskMessage('not_found', new Error('nf err'))).toBe('llm_not_found: nf err');
    expect(toTaskMessage('unknown', new Error('unk err'))).toBe('unk err');
  });
});

describe('attachProviderError', () => {
  it('attaches status and providerBody without replacing message', () => {
    const err = new Error('test');
    const result = attachProviderError(err, 400, '{"error":"ctx"}');
    expect((result as any).status).toBe(400);
    expect((result as any).providerBody).toBe('{"error":"ctx"}');
    expect(result.message).toBe('test'); // message preserved
  });
});
