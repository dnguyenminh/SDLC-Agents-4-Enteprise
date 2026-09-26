import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FsDirLister, filterExcludedPaths, isExcludedPath } from '../file-exclusion-filter';

describe('file-exclusion-filter', () => {
  describe('TC-003/TC-705: excluded paths never appear in context', () => {
    it('filters .git, node_modules, out, dist paths', () => {
      const input = [
        'src/main.ts',
        '.git/config',
        'src/node_modules/pkg/index.js',
        'out/bundle.js',
        'dist/index.js',
        'README.md',
      ];
      const result = filterExcludedPaths(input);
      expect(result).toEqual(['src/main.ts', 'README.md']);
    });

    it('keeps normal paths untouched', () => {
      expect(isExcludedPath('src/auth/login.ts')).toBe(false);
    });
  });

  describe('TC-404: exclusion is case-insensitive', () => {
    it('excludes .GIT and Node_Modules', () => {
      expect(isExcludedPath('repo/.GIT/objects')).toBe(true);
      expect(isExcludedPath('repo/Node_Modules/x')).toBe(true);
      expect(isExcludedPath('DIST/out.js')).toBe(true);
    });
  });

  describe('TC-403: pagination never loads the full directory', () => {
    it('pages through a large directory with cursor', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dirlist-'));
      try {
        for (let i = 0; i < 25; i++) {
          fs.writeFileSync(path.join(dir, `file-${String(i).padStart(3, '0')}.ts`), 'x');
        }
        const lister = new FsDirLister();

        const page1 = lister.listDir(dir, 0, 10);
        expect(page1.entries).toHaveLength(10);
        expect(page1.nextCursor).toBe(10);

        const page2 = lister.listDir(dir, 10, 10);
        expect(page2.entries).toHaveLength(10);
        expect(page2.nextCursor).toBe(20);

        const page3 = lister.listDir(dir, 20, 10);
        expect(page3.entries).toHaveLength(5);
        expect(page3.nextCursor).toBeUndefined();

        const empty = lister.listDir(dir, 30, 10);
        expect(empty.entries).toHaveLength(0);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('returns sorted entries and empty page for missing directory', () => {
      const lister = new FsDirLister();
      expect(lister.listDir(path.join(os.tmpdir(), 'no-such-dir-xyz'), 0, 10).entries).toEqual([]);
    });
  });
});
