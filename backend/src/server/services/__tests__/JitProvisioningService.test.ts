import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JitProvisioningService } from '../JitProvisioningService.js';
import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import type { NormalizedProfile } from '../../auth/models/NormalizedProfile.js';

vi.mock('../../admin/db/audit.js', () => ({
  recordAudit: vi.fn().mockResolvedValue(undefined),
}));

describe('JitProvisioningService', () => {
  let db: Partial<DatabaseAdapter>;
  let service: JitProvisioningService;

  beforeEach(() => {
    db = {
      getAsync: vi.fn(),
      runAsync: vi.fn().mockResolvedValue({ changes: 1, lastInsertRowid: 1 }),
    };
    service = new JitProvisioningService(db as DatabaseAdapter);
  });

  it('creates new SSO user on JIT provision with Entra claims', async () => {
    vi.mocked(db.getAsync!).mockResolvedValueOnce(undefined);
    vi.mocked(db.getAsync!).mockResolvedValueOnce(undefined);
    vi.mocked(db.getAsync!).mockResolvedValueOnce({ user_id: 'user-abc', account_type: 'SSO' });

    const claims = { email: 'new@example.com', email_verified: true, oid: 'oid123', name: 'New User' };
    const result = await service.provision(claims);

    expect(result.created).toBe(true);
    expect(result.linked).toBe(false);
    const insertCall = (db.runAsync as any).mock.calls.find(c => c[0].includes('INSERT INTO users'));
    expect(insertCall).toBeDefined();
    expect(insertCall[1][7]).toBe('entra');
    expect(insertCall[1][8]).toBe('oid123');
  });

  it('provisions new user with Google NormalizedProfile', async () => {
    vi.mocked(db.getAsync!).mockResolvedValueOnce(undefined);
    vi.mocked(db.getAsync!).mockResolvedValueOnce(undefined);
    vi.mocked(db.getAsync!).mockResolvedValueOnce({ user_id: 'user-goog', account_type: 'SSO' });

    const profile: NormalizedProfile = {
      provider: 'google',
      externalSubjectId: 'google-sub-999',
      email: 'user@gmail.com',
      emailVerified: true,
      name: 'Google User',
    };

    const result = await service.provision(profile);
    expect(result.created).toBe(true);
    const insertCall = (db.runAsync as any).mock.calls.find(c => c[0].includes('INSERT INTO users'));
    expect(insertCall[1][7]).toBe('google');
    expect(insertCall[1][8]).toBe('google-sub-999');
  });

  it('provisions new user with GitHub NormalizedProfile and ignores groups', async () => {
    vi.mocked(db.getAsync!).mockResolvedValueOnce(undefined);
    vi.mocked(db.getAsync!).mockResolvedValueOnce(undefined);
    vi.mocked(db.getAsync!).mockResolvedValueOnce({ user_id: 'user-gh', account_type: 'SSO' });

    const profile: NormalizedProfile = {
      provider: 'github',
      externalSubjectId: 'gh-id-12345',
      email: 'dev@github.com',
      emailVerified: true,
      name: 'GitHub Dev',
      groups: ['Admin'], // GitHub groups must NOT map to grp-admin
    };

    const result = await service.provision(profile);
    expect(result.created).toBe(true);
    const insertCall = (db.runAsync as any).mock.calls.find(c => c[0].includes('INSERT INTO users'));
    expect(insertCall[1][4]).toBe('grp-viewer');
    expect(insertCall[1][7]).toBe('github');
    expect(insertCall[1][8]).toBe('gh-id-12345');
  });

  // SEC-01: auto-linking an SSO login onto an existing LOCAL account is an account
  // takeover vector and must be rejected (linking is only allowed from settings).
  it('rejects auto-link to LOCAL account (SEC-01 account takeover guard)', async () => {
    const existing = { user_id: 'user-1', email: 'local@example.com', account_type: 'LOCAL' };
    vi.mocked(db.getAsync!).mockResolvedValueOnce(undefined); // no existing external identity
    vi.mocked(db.getAsync!).mockResolvedValueOnce(existing);  // email match -> LOCAL account

    const profile: NormalizedProfile = {
      provider: 'google',
      externalSubjectId: 'goog-456',
      email: 'local@example.com',
      emailVerified: true,
      name: 'Local User',
    };

    await expect(service.provision(profile)).rejects.toThrow(
      'Auto-linking SSO to an existing local account is not allowed; link from account settings.'
    );
    // Must NOT have run the UPDATE that would seize the local account.
    const updateCall = (db.runAsync as any).mock.calls.find(
      (call: any[]) => typeof call[0] === 'string' && call[0].includes('UPDATE users SET external_provider')
    );
    expect(updateCall).toBeUndefined();
  });

  // Rare case: account_type is already 'SSO' but has no external identity yet —
  // linking is still permitted (this is not a local account being taken over).
  it('links existing SSO-type account without external identity', async () => {
    const existing = { user_id: 'user-1b', email: 'sso@example.com', account_type: 'SSO' };
    vi.mocked(db.getAsync!).mockResolvedValueOnce(undefined);
    vi.mocked(db.getAsync!).mockResolvedValueOnce(existing);
    vi.mocked(db.getAsync!).mockResolvedValueOnce({ ...existing, external_provider: 'google' });

    const profile: NormalizedProfile = {
      provider: 'google',
      externalSubjectId: 'goog-457',
      email: 'sso@example.com',
      emailVerified: true,
      name: 'SSO User',
    };

    const result = await service.provision(profile);
    expect(result.created).toBe(false);
    expect(result.linked).toBe(true);
    expect(db.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE users SET external_provider'),
      expect.arrayContaining(['google', 'goog-457'])
    );
  });

  it('returns existing SSO identity without re-creating', async () => {
    const existing = { user_id: 'user-gh-1', external_provider: 'github', external_subject_id: 'gh-101' };
    vi.mocked(db.getAsync!).mockResolvedValueOnce(existing);

    const profile: NormalizedProfile = {
      provider: 'github',
      externalSubjectId: 'gh-101',
      email: 'gh@example.com',
      emailVerified: true,
      name: 'GH User',
    };

    const result = await service.provision(profile);
    expect(result.created).toBe(false);
    expect(result.linked).toBe(false);
    expect(result.user).toEqual(existing);
  });

  it('rejects JIT provision when email not verified', async () => {
    vi.mocked(db.getAsync!).mockResolvedValueOnce(undefined);
    vi.mocked(db.getAsync!).mockResolvedValueOnce(undefined);

    const claims = { email: 'unverified@example.com', email_verified: false, oid: 'oid789' };
    await expect(service.provision(claims)).rejects.toThrow('Email not verified by Entra ID; JIT provisioning rejected');
  });

  it('rejects Google JIT provision when email not verified', async () => {
    vi.mocked(db.getAsync!).mockResolvedValueOnce(undefined);
    vi.mocked(db.getAsync!).mockResolvedValueOnce(undefined);

    const profile: NormalizedProfile = {
      provider: 'google',
      externalSubjectId: 'goog-unverified',
      email: 'unverified@gmail.com',
      emailVerified: false,
      name: 'Unverified Google',
    };
    await expect(service.provision(profile)).rejects.toThrow('Email not verified by google; JIT provisioning rejected');
  });

  it('rejects linking when email not verified', async () => {
    const existing = { user_id: 'user-2', email: 'local2@example.com', account_type: 'LOCAL' };
    vi.mocked(db.getAsync!).mockResolvedValueOnce(undefined);
    vi.mocked(db.getAsync!).mockResolvedValueOnce(existing);

    const claims = { email: 'local2@example.com', email_verified: false, oid: 'oid999' };
    await expect(service.provision(claims)).rejects.toThrow('Email not verified by Entra ID; linking rejected');
  });

  it('rejects linking HYBRID account per anti-HYBRID policy', async () => {
    const existing = { user_id: 'user-3', email: 'hybrid@example.com', account_type: 'HYBRID' };
    vi.mocked(db.getAsync!).mockResolvedValueOnce(undefined);
    vi.mocked(db.getAsync!).mockResolvedValueOnce(existing);

    const claims = { email: 'hybrid@example.com', email_verified: true, oid: 'oid111' };
    await expect(service.provision(claims)).rejects.toThrow('Invalid account_type HYBRID - HYBRID not allowed');
  });
});
