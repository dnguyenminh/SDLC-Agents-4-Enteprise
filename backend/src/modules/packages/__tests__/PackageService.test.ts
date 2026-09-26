import { describe, it, expect, vi } from 'vitest';
import { PackageService } from '../service/PackageService.js';
import type { IPackageConfigRepository } from '../repository/PackageConfigRepository.js';

describe('PackageService', () => {
  it('lists packages', async () => {
    const repo = {
      findAll: vi.fn().mockResolvedValue([{ packageId: 'a', packageName: 'A', enabled: true }]),
    } as unknown as IPackageConfigRepository;
    const svc = new PackageService(repo);
    const list = await svc.listPackages();
    expect(list).toHaveLength(1);
    expect(repo.findAll).toHaveBeenCalled();
  });

  it('toggles package with validation', async () => {
    const repo = {
      update: vi.fn().mockResolvedValue(undefined),
    } as unknown as IPackageConfigRepository;
    const svc = new PackageService(repo);
    await expect(svc.togglePackage('', true)).rejects.toThrow('PackageId must be non-empty');
    await expect(svc.togglePackage('id', 'yes' as unknown as boolean)).rejects.toThrow('Enabled must be boolean');
    await svc.togglePackage('id', false);
    expect(repo.update).toHaveBeenCalledWith('id', false);
  });
});
