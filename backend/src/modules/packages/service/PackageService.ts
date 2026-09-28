import { PRE_INSTALL_PACKAGES, type PackageConfig } from '../model/PackageConfig.js';
import type { IPackageConfigRepository } from '../repository/PackageConfigRepository.js';

export class PackageService {
  constructor(private repo: IPackageConfigRepository) {}

  async listPackages(): Promise<PackageConfig[]> {
    return this.repo.findAll();
  }

  async togglePackage(packageId: string, enabled: boolean): Promise<void> {
    if (!packageId || packageId.trim() === '') {
      throw new Error('PackageId must be non-empty');
    }
    if (typeof enabled !== 'boolean') {
      throw new Error('Enabled must be boolean');
    }
    await this.repo.update(packageId, enabled);
  }

  async getPreInstallList(): Promise<string[]> {
    return [...PRE_INSTALL_PACKAGES] as string[];
  }
}
