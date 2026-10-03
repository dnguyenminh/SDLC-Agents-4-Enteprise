/**
 * Unit tests for LLM connectivity error diagnostics (SA4E-336 `fetch failed` triage).
 */

import { describe, it, expect } from 'vitest';
import { describeError, isConnectivityFailure } from '../llm-error.js';

/** Build the undici shape: "fetch failed" -> AggregateError(ECONNREFUSED). */
function refusedFetch(address = '127.0.0.1', port = 1234): Error {
  const perAddress = Object.assign(
    new Error(`connect ECONNREFUSED ${address}:${port}`),
    { code: 'ECONNREFUSED', address, port },
  );
  const aggregate = Object.assign(
    new AggregateError([perAddress], 'connect ECONNREFUSED'),
    { code: 'ECONNREFUSED' },
  );
  return new Error('fetch failed', { cause: aggregate });
}

describe('describeError', () => {
  it('expands the undici "fetch failed" cause chain with code and address', () => {
    const detail = describeError(refusedFetch());
    expect(detail).toContain('fetch failed');
    expect(detail).toContain('ECONNREFUSED');
    expect(detail).toContain('127.0.0.1:1234');
  });

  it('reports each attempted address of a multi-address AggregateError', () => {
    const detail = describeError(refusedFetch('::1', 1234));
    expect(detail).toContain('attempts:');
    expect(detail).toContain('::1:1234');
  });

  it('returns the message of a plain error without a cause', () => {
    expect(describeError(new Error('LLM server returned 500'))).toBe('LLM server returned 500');
  });

  it('stringifies non-Error values', () => {
    expect(describeError('boom')).toBe('boom');
  });

  it('terminates on a self-referencing cause chain', () => {
    const err = new Error('loop') as Error & { cause?: unknown };
    err.cause = err;
    expect(describeError(err)).toContain('loop');
  });
});

describe('isConnectivityFailure', () => {
  it('is true for ECONNREFUSED wrapped by "fetch failed"', () => {
    expect(isConnectivityFailure(refusedFetch())).toBe(true);
  });

  it('is true for a timeout/abort', () => {
    const abort = new Error('This operation was aborted');
    abort.name = 'AbortError';
    expect(isConnectivityFailure(abort)).toBe(true);
  });

  it('is true for a DNS failure', () => {
    const dns = Object.assign(new Error('getaddrinfo ENOTFOUND lmstudio.local'),
      { code: 'ENOTFOUND' });
    expect(isConnectivityFailure(new Error('fetch failed', { cause: dns }))).toBe(true);
  });

  it('is false for a genuine config failure', () => {
    expect(isConnectivityFailure(new Error('LLM server returned 401'))).toBe(false);
  });
});
