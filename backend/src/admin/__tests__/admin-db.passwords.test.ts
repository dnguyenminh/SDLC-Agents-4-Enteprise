/**
 * Unit Tests — admin-db.ts (KSA-285: Auth & Multitenant)
 * SA4E-50: All DB functions are now async — all calls must be awaited.
 */

import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
} from '../admin-db.js';

// ============================================================
// 1. Password Hashing (sync — no change needed)
// ============================================================

describe('Password Hashing', () => {
  it('hashPassword returns salt:hash format', () => {
    const hashed = hashPassword('testPassword123');
    expect(hashed).toContain(':');
    const [salt, hash] = hashed.split(':');
    expect(salt.length).toBe(32);
    expect(hash.length).toBe(128);
  });

  it('hashPassword produces different hashes for same password', () => {
    expect(hashPassword('samePassword')).not.toBe(hashPassword('samePassword'));
  });

  it('verifyPassword returns true for correct password', () => {
    const hashed = hashPassword('mySecretPass!');
    expect(verifyPassword('mySecretPass!', hashed)).toBe(true);
  });

  it('verifyPassword returns false for wrong password', () => {
    expect(verifyPassword('wrong', hashPassword('correct'))).toBe(false);
  });

  it('verifyPassword returns false for invalid stored format', () => {
    expect(verifyPassword('test', 'invalid-no-colon')).toBe(false);
    expect(verifyPassword('test', '')).toBe(false);
  });
});
