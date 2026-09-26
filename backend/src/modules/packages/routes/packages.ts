import { Hono } from 'hono';
import { PackageService } from '../service/PackageService.js';
import { InMemoryPackageConfigRepository } from '../repository/PackageConfigRepository.js';
import type { PackageConfig } from '../model/PackageConfig.js';
import { PRE_INSTALL_PACKAGES } from '../model/PackageConfig.js';

function createDefaultRepo(): InMemoryPackageConfigRepository {
  const defaults: PackageConfig[] = PRE_INSTALL_PACKAGES.map(id => ({
    packageId: id,
    packageName: id.replace(/-/g, ' '),
    version: '1.0.0',
    enabled: true,
    status: 'installed',
  }));
  return new InMemoryPackageConfigRepository(defaults);
}

const repo = createDefaultRepo();
const service = new PackageService(repo);

export function createPackagesRoutes() {
  const app = new Hono();

  app.get('/api/packages/list', async (c) => {
    const list = await service.listPackages();
    return c.json({ data: list, timestamp: new Date().toISOString() });
  });

  app.patch('/api/packages/:id', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json<{ enabled?: boolean }>();
    try {
      await service.togglePackage(id, !!body.enabled);
      return c.json({ data: { packageId: id, enabled: body.enabled }, timestamp: new Date().toISOString() });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return c.json({ error: { code: 'VALIDATION_ERROR', message } }, 400);
    }
  });

  return app;
}
