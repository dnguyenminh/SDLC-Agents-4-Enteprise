/**
 * Unit tests — auth/one-time-codes.ts (SA4E-321).
 * A login redirect must carry a code that can be redeemed exactly once and
 * only inside its TTL, so a leaked URL is worthless after the first use.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { issueAuthCode, consumeAuthCode } from '../one-time-codes.js';

describe('one-time auth codes', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('redeems a code exactly once', () => {
    const payload = { token: 'refresh-abc', accessToken: 'jwt-abc' };
    const code = issueAuthCode(payload);
    expect(consumeAuthCode(code)).toEqual(payload);
    expect(consumeAuthCode(code)).toBeNull();
  });

  it('rejects an unknown code', () => {
    expect(consumeAuthCode('not-a-real-code')).toBeNull();
  });

  it('expires a code after 60 seconds', () => {
    const code = issueAuthCode({ token: 'refresh-abc' });
    vi.advanceTimersByTime(59_000);
    expect(consumeAuthCode(code)).not.toBeNull();

    const second = issueAuthCode({ token: 'refresh-def' });
    vi.advanceTimersByTime(61_000);
    expect(consumeAuthCode(second)).toBeNull();
  });

  it('mints unguessable codes', () => {
    const codes = new Set(Array.from({ length: 50 }, () => issueAuthCode({ token: 'x' })));
    expect(codes.size).toBe(50);
    for (const code of codes) {
      expect(code.length).toBeGreaterThanOrEqual(32);
      expect(code).not.toContain('=');
    }
  });
});
