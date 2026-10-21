/**
 * SA4E-26 - Project Isolation Tests.
 * This file: UT — deriveProjectId via loadConfig (no DB).
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('SA4E-26 UT — deriveProjectId', () => {
  const originalEnv = process.env.CODE_INTEL_PROJECT_ID;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.CODE_INTEL_PROJECT_ID;
    } else {
      process.env.CODE_INTEL_PROJECT_ID = originalEnv;
    }
  });

  it('UT-09: Unix path with no explicit source does not infer identity', async () => {
    delete process.env.CODE_INTEL_PROJECT_ID;
    const { loadConfig } = await import('../../../config/index.js');
    const config = loadConfig({ workspace: '/projects/my-app' } as any);
    // The backend never guesses project identity from the folder path: no
    // explicit source means the 'default' sentinel (writes fail closed).
    expect(config.projectId).toBe('default');
  });

  it('UT-10: Windows path with no explicit source does not infer identity', async () => {
    delete process.env.CODE_INTEL_PROJECT_ID;
    const { loadConfig } = await import('../../../config/index.js');
    const config = loadConfig({ workspace: 'C:\\projects\\my-app' } as any);
    expect(config.projectId).toBe('default');
  });

  it('UT-11: root path yields the default sentinel (SA4E-375)', async () => {
    delete process.env.CODE_INTEL_PROJECT_ID;
    const { loadConfig } = await import('../../../config/index.js');
    const config = loadConfig({ workspace: '/' } as any);
    // Root path is special — gets the 'default' sentinel regardless of platform
    // (CI runs on Linux where '/' is the actual root; Windows treats it similarly after SA4E-375)
    expect(config.projectId).toBe('default');
  });

  it('UT-12: empty workspace yields the default sentinel', async () => {
    delete process.env.CODE_INTEL_PROJECT_ID;
    const { loadConfig } = await import('../../../config/index.js');
    const config = loadConfig({ workspace: '' } as any);
    expect(config.projectId).toBe('default');
  });

  it('UT-15: reads an explicit .code-intel/project.json from the workspace', async () => {
    delete process.env.CODE_INTEL_PROJECT_ID;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sa4e-proj-'));
    fs.mkdirSync(path.join(tmp, '.code-intel'), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, '.code-intel', 'project.json'),
      JSON.stringify({ projectId: 'from-project-json' }),
    );
    try {
      const { loadConfig } = await import('../../../config/index.js');
      const config = loadConfig({ workspace: tmp } as any);
      expect(config.projectId).toBe('from-project-json');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('UT-13: deriveProjectId with config override', async () => {
    delete process.env.CODE_INTEL_PROJECT_ID;
    const { loadConfig } = await import('../../../config/index.js');
    const config = loadConfig({ workspace: '/projects/my-app', projectId: 'custom-name' } as any);
    expect(config.projectId).toBe('custom-name');
  });

  it('UT-14: deriveProjectId with environment variable', async () => {
    process.env.CODE_INTEL_PROJECT_ID = 'env-project';
    const { loadConfig } = await import('../../../config/index.js');
    const config = loadConfig({ workspace: '/projects/my-app' } as any);
    expect(config.projectId).toBe('env-project');
  });
});
