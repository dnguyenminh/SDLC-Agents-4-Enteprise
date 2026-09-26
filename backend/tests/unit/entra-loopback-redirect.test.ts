/**
 * SA4E-262 / SA4E-272 — Security unit tests for isLoopbackRedirect().
 *
 * The Entra callback appends the real session token to loopback redirect URLs,
 * so isLoopbackRedirect() is the gate that decides which targets are trusted to
 * receive that token. These tests pin down the narrow accepted shape
 * (http://127.0.0.1:<port>/callback) and reject widening/exfiltration vectors.
 */
import { describe, it, expect } from 'vitest';
import { isLoopbackRedirect } from '../../src/server/routes/auth/entra.js';

describe('isLoopbackRedirect — accepted (extension desktop flow)', () => {
  it('accepts http://127.0.0.1:<port>/callback (exact extension contract)', () => {
    expect(isLoopbackRedirect('http://127.0.0.1:8765/callback')).toBe(true);
    expect(isLoopbackRedirect('http://127.0.0.1:9764/callback')).toBe(true);
  });
});

describe('isLoopbackRedirect — rejected (security)', () => {
  it('rejects undefined / empty / malformed', () => {
    expect(isLoopbackRedirect(undefined)).toBe(false);
    expect(isLoopbackRedirect('')).toBe(false);
    expect(isLoopbackRedirect('not a url')).toBe(false);
  });

  it('rejects https scheme (extension uses http loopback only)', () => {
    expect(isLoopbackRedirect('https://127.0.0.1:8765/callback')).toBe(false);
  });

  it('rejects localhost and ::1 (avoid DNS-rebinding / surface widening)', () => {
    expect(isLoopbackRedirect('http://localhost:8765/callback')).toBe(false);
    expect(isLoopbackRedirect('http://[::1]:8765/callback')).toBe(false);
  });

  it('rejects non-/callback paths (no token on arbitrary local paths)', () => {
    expect(isLoopbackRedirect('http://127.0.0.1:8765/')).toBe(false);
    expect(isLoopbackRedirect('http://127.0.0.1:8765/steal')).toBe(false);
  });

  it('rejects non-loopback hosts (open-redirect / exfiltration)', () => {
    expect(isLoopbackRedirect('http://evil.com/callback')).toBe(false);
    expect(isLoopbackRedirect('http://127.0.0.1.evil.com/callback')).toBe(false);
    expect(isLoopbackRedirect('http://10.0.0.1/callback')).toBe(false);
  });

  it('rejects internal app paths (those go through the cookie/allow-list flow)', () => {
    expect(isLoopbackRedirect('/admin?page=dashboard')).toBe(false);
  });
});
