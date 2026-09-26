import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { PackageService } from '../service/PackageService.js';
import { InMemoryPackageConfigRepository } from '../repository/PackageConfigRepository.js';

describe('PackageService Property Tests', () => {
  it('toggle preserves boolean', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1 }), fc.boolean(), async (id, enabled) => {
        const repo = new InMemoryPackageConfigRepository([{ packageId: id, packageName: 'x', enabled: true }]);
        const svc = new PackageService(repo);
        await svc.togglePackage(id, enabled);
        const pkg = await repo.findById(id);
        return pkg?.enabled === enabled;
      })
    );
  });
});
