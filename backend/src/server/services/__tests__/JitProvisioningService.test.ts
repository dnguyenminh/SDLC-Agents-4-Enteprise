import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JitProvisioningService } from '../JitProvisioningService.js';
import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';

// Mock recordAudit
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

  it('creates new SSO user on JIT provision', async () => {
    vi.mocked(db.getAsync!).mockResolvedValueOnce(undefined); // no external identity
    vi.mocked(db.getAsync!).mockResolvedValueOnce(undefined); // no email match
    vi.mocked(db.getAsync!).mockResolvedValueOnce({ user_id: 'user-abc', account_type: 'SSO' }); // after insert

    const claims = {
      email: 'new@example.com',
      email_verified: true,
      oid: 'oid123',
      name: 'New User',
      groups: [],
    };

    const result = await service.provision(claims);

    expect(result.created).toBe(true);
    expect(result.linked).toBe(false);
    expect(result.user.account_type).toBe('SSO');
    const insertCall = (db.runAsync as any).mock.calls.find(c => c[0].includes('INSERT INTO users'));
    expect(insertCall).toBeDefined();
    const params = insertCall[1];
    expect(params[1]).toBe('new');
    expect(params[2]).toBe('new@example.com');
    expect(params[3]).toBeNull();
    expect(params[4]).toBe('grp-viewer');
    expect(params[7]).toBe('entra');
    expect(params[8]).toBe('oid123');
    expect(params[0]).toMatch(/^user-/);
  });

  it('links existing local user to SSO', async () => {
    const existingUser = {
      user_id: 'user-1',
      email: 'local@example.com',
      account_type: 'LOCAL',
      external_provider: null,
      external_subject_id: null,
    };
    vi.mocked(db.getAsync!).mockResolvedValueOnce(undefined); // no external identity
    vi.mocked(db.getAsync!).mockResolvedValueOnce(existingUser); // email match
    vi.mocked(db.getAsync!).mockResolvedValueOnce({ ...existingUser, external_provider: 'entra' }); // after update

    const claims = {
      email: 'local@example.com',
      email_verified: true,
      oid: 'oid456',
      name: 'Local User',
    };

    const result = await service.provision(claims);

    expect(result.created).toBe(false);
    expect(result.linked).toBe(true);
    expect(db.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE users SET external_provider'),
      expect.arrayContaining(['entra', 'oid456'])
    );
  });

  it('rejects JIT provision when email not verified', async () => {
    vi.mocked(db.getAsync!).mockResolvedValueOnce(undefined);
    vi.mocked(db.getAsync!).mockResolvedValueOnce(undefined);

    const claims = {
      email: 'unverified@example.com',
      email_verified: false,
      oid: 'oid789',
    };

    await expect(service.provision(claims)).rejects.toThrow('Email not verified by Entra ID; JIT provisioning rejected');
    expect(db.runAsync).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO users'), expect.any(Array));
  });

  it('rejects linking when email not verified', async () => {
    const existingUser = {
      user_id: 'user-2',
      email: 'local2@example.com',
      account_type: 'LOCAL',
      external_provider: null,
      external_subject_id: null,
    };
    vi.mocked(db.getAsync!).mockResolvedValueOnce(undefined);
    vi.mocked(db.getAsync!).mockResolvedValueOnce(existingUser);

    const claims = {
      email: 'local2@example.com',
      email_verified: false,
      oid: 'oid999',
    };

    await expect(service.provision(claims)).rejects.toThrow('Email not verified by Entra ID; linking rejected');
    expect(db.runAsync).not.toHaveBeenCalledWith(expect.stringContaining('UPDATE users SET external_provider'), expect.any(Array));
  });

  it('rejects linking HYBRID account per anti-HYBRID policy', async () => {
    const existingUser = {
      user_id: 'user-3',
      email: 'hybrid@example.com',
      account_type: 'HYBRID',
      external_provider: null,
      external_subject_id: null,
    };
    vi.mocked(db.getAsync!).mockResolvedValueOnce(undefined);
    vi.mocked(db.getAsync!).mockResolvedValueOnce(existingUser);

    const claims = {
      email: 'hybrid@example.com',
      email_verified: true,
      oid: 'oid111',
    };

    await expect(service.provision(claims)).rejects.toThrow('Invalid account_type HYBRID - HYBRID not allowed');
    expect(db.runAsync).not.toHaveBeenCalledWith(expect.stringContaining('UPDATE users SET external_provider'), expect.any(Array));
  });
});
