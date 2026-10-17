import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildNotFoundHint, extractMissingPath } from '../not-found-hint.js';

describe('not-found-hint (v1.53.7)', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'nfh-'));
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('adds Did-you-mean candidates for a missing file that exists one level deeper', () => {
    const handlers = path.join(root, 'handlers');
    fs.mkdirSync(path.join(handlers, '__tests__'), { recursive: true });
    const real = path.join(handlers, '__tests__', 'backend-settings-handler.test.ts');
    fs.writeFileSync(real, 'x');
    const missing = path.join(handlers, 'backend-settings-handler.test.ts');
    const hint = buildNotFoundHint(root, `Path not found: ${missing}`);
    expect(hint).toBeDefined();
    expect(hint).toContain('Did you mean');
    expect(hint).toContain(real.replace(/\\/g, '/'));
    expect(hint).toContain('PARENT folder');
  });

  it('explains the read tool for ls-on-a-file errors (no Did-you-mean)', () => {
    const hint = buildNotFoundHint(root, `Not a directory: ${path.join(root, 'x.ts')}`);
    expect(hint).toBeDefined();
    expect(hint).toContain('read tool');
    expect(hint).not.toContain('Did you mean');
  });

  it('returns undefined for foreign errors so they rethrow untouched', () => {
    expect(buildNotFoundHint(root, 'boom')).toBeUndefined();
  });

  it('still includes the workspace layout when no candidate exists', () => {
    const hint = buildNotFoundHint(
      root,
      `ENOENT: no such file or directory, access '${path.join(root, 'nope.ts')}'`
    );
    expect(hint).toContain('Workspace root:');
    expect(hint).not.toContain('Did you mean');
  });

  it('extractMissingPath picks the first absolute path and stops at quotes', () => {
    expect(extractMissingPath(`ENOENT: no such file or directory, access 'C:/x/y.ts'`)).toBe('C:/x/y.ts');
    expect(extractMissingPath(`Path not found: C:\\proj\\a\\b.test.ts`)).toBe('C:\\proj\\a\\b.test.ts');
    expect(extractMissingPath('no path here')).toBeUndefined();
  });
});
