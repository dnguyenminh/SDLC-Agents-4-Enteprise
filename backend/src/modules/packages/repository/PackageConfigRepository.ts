import type { PackageConfig } from '../model/PackageConfig.js';

export interface IPackageConfigRepository {
  findAll(): Promise<PackageConfig[]>;
  findById(id: string): Promise<PackageConfig | undefined>;
  update(id: string, enabled: boolean): Promise<void>;
}

export class InMemoryPackageConfigRepository implements IPackageConfigRepository {
  private store: Map<string, PackageConfig> = new Map();

  constructor(initial: PackageConfig[] = []) {
    for (const p of initial) this.store.set(p.packageId, p);
  }

  async findAll(): Promise<PackageConfig[]> {
    return Array.from(this.store.values());
  }

  async findById(id: string): Promise<PackageConfig | undefined> {
    return this.store.get(id);
  }

  async update(id: string, enabled: boolean): Promise<void> {
    const existing = this.store.get(id);
    if (!existing) throw new Error('Package not found');
    this.store.set(id, { ...existing, enabled, lastUpdated: new Date().toISOString() });
  }
}
