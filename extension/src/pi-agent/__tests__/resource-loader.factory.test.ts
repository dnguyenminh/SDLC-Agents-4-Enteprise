import { describe, it, expect, vi } from 'vitest';
import { createResourceLoader, reloadResourceLoader, logDiagnostics } from '../resource-loader.factory';

describe('resource-loader.factory', () => {
  it('creates mock loader when SDK is unavailable', () => {
    const loader = createResourceLoader({ cwd: '/tmp', agentDir: '/agent' });
    expect(loader).toBeDefined();
    expect(typeof loader.reload).toBe('function');
  });

  it('reloadResourceLoader succeeds for mock loader', async () => {
    const loader = { reload: vi.fn() };
    await expect(reloadResourceLoader(loader as any)).resolves.not.toThrow();
    expect(loader.reload).toHaveBeenCalled();
  });

  it('reloadResourceLoader throws on error', async () => {
    const loader = { reload: vi.fn(() => { throw new Error('fail'); }) };
    await expect(reloadResourceLoader(loader as any)).rejects.toThrow('Resource discovery failed');
  });

  it('logDiagnostics logs warnings when diagnostics present', () => {
    const loader = { getDiagnostics: () => ['warn1', 'warn2'] };
    // Should not throw
    expect(() => logDiagnostics(loader as any)).not.toThrow();
  });
});
