/**
 * Unit tests — SA4E-266 token verifiers.
 * This file: LocalHS256Verifier (BR-04).
 */

import { describe, it, expect } from 'vitest';
import { LocalHS256Verifier } from './LocalHS256Verifier.js';
import { signHs256 } from './helpers.js';

describe('LocalHS256Verifier (BR-04)', () => {
  it('accepts a valid HS256 token', async () => {
    const verifier = new LocalHS256Verifier('secret');
    const token = await signHs256({ sub: 'u', iss: 'local' }, 'secret');
    const claims = await verifier.verify(token);
    expect(claims.sub).toBe('u');
  });

  it('rejects an invalid signature -> ERR-01', async () => {
    const verifier = new LocalHS256Verifier('right-secret');
    const token = await signHs256({ sub: 'u' }, 'wrong-secret');
    await expect(verifier.verify(token)).rejects.toMatchObject({ code: 'invalid_signature', status: 401 });
  });

  it('rejects an expired token -> ERR-04', async () => {
    const verifier = new LocalHS256Verifier('secret');
    const token = await signHs256({ sub: 'u', exp: Math.floor(Date.now() / 1000) - 3600 }, 'secret');
    await expect(verifier.verify(token)).rejects.toMatchObject({ code: 'token_expired', status: 401 });
  });
});
