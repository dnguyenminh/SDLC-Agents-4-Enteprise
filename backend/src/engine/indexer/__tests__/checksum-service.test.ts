import { describe, it, expect, vi } from 'vitest';
import { ChecksumService } from '../checksum-service.js';
import * as crypto from 'crypto';

describe('ChecksumService', () => {
  it('computeChecksum returns SHA-256 hex', () => {
    const repo = { loadAll: vi.fn(), upsert: vi.fn(), deleteNotIn: vi.fn() } as any;
    const svc = new ChecksumService(repo);
    const content = Buffer.from('hello');
    const expected = crypto.createHash('sha256').update(content).digest('hex');
    expect(svc.computeChecksum(content)).toBe(expected);
  });

  it('shouldSkip returns true when checksum matches', () => {
    const svc = new ChecksumService({} as any);
    const map = new Map([['a.ts', 'abc']]);
    expect(svc.shouldSkip('a.ts', 'abc', map)).toBe(true);
  });

  it('shouldSkip returns false when checksum differs', () => {
    const svc = new ChecksumService({} as any);
    const map = new Map([['a.ts', 'abc']]);
    expect(svc.shouldSkip('a.ts', 'def', map)).toBe(false);
  });

  it('shouldSkip returns false when path not in map', () => {
    const svc = new ChecksumService({} as any);
    const map = new Map<string, string>();
    expect(svc.shouldSkip('b.ts', 'abc', map)).toBe(false);
  });

  it('preloadChecksums returns map from repo', async () => {
    const map = new Map([['a.ts', 'x'], ['b.ts', 'y']]);
    const repo = { loadAll: vi.fn().mockResolvedValue(map), upsert: vi.fn(), deleteNotIn: vi.fn() } as any;
    const svc = new ChecksumService(repo);
    const result = await svc.preloadChecksums('u1', 'p1');
    expect(result.get('a.ts')).toBe('x');
    expect(result.get('b.ts')).toBe('y');
    expect(repo.loadAll).toHaveBeenCalledWith('u1', 'p1');
  });

  it('upsert delegates to repo', async () => {
    const repo = { loadAll: vi.fn(), upsert: vi.fn().mockResolvedValue(undefined), deleteNotIn: vi.fn() } as any;
    const svc = new ChecksumService(repo);
    await svc.upsert('u1', 'p1', 'a.ts', 'chk');
    expect(repo.upsert).toHaveBeenCalledWith({ user_id: 'u1', project_id: 'p1', file_path: 'a.ts', file_checksum: 'chk' });
  });

  it('cleanupDeleted delegates to repo', async () => {
    const repo = { loadAll: vi.fn(), upsert: vi.fn(), deleteNotIn: vi.fn().mockResolvedValue(3) } as any;
    const svc = new ChecksumService(repo);
    const removed = await svc.cleanupDeleted('u1', 'p1', ['a.ts']);
    expect(removed).toBe(3);
    expect(repo.deleteNotIn).toHaveBeenCalledWith('u1', 'p1', ['a.ts']);
  });

  it('preloadChecksums degrades to empty map on repo error (EF-04)', async () => {
    const repo = { loadAll: vi.fn().mockRejectedValue(new Error('db down')), upsert: vi.fn(), deleteNotIn: vi.fn() } as any;
    const svc = new ChecksumService(repo);
    const result = await svc.preloadChecksums('u1', 'p1');
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });

  it('upsert degrades silently on repo error (non-fatal)', async () => {
    const repo = { loadAll: vi.fn(), upsert: vi.fn().mockRejectedValue(new Error('db down')), deleteNotIn: vi.fn() } as any;
    const svc = new ChecksumService(repo);
    await expect(svc.upsert('u1', 'p1', 'a.ts', 'chk')).resolves.toBeUndefined();
  });

  it('cleanupDeleted returns 0 on repo error (non-fatal)', async () => {
    const repo = { loadAll: vi.fn(), upsert: vi.fn(), deleteNotIn: vi.fn().mockRejectedValue(new Error('db down')) } as any;
    const svc = new ChecksumService(repo);
    const removed = await svc.cleanupDeleted('u1', 'p1', ['a.ts']);
    expect(removed).toBe(0);
  });
});
