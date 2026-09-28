/**
 * SEC-325-D1 — unit tests for MCP-derived path containment.
 * Every candidate path is untrusted (mem_search KB entries are agent-writable).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  filterContainedCandidates,
  isPathContained,
  resolveContainedPath,
} from '../path-containment';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'containment-test-'));
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'ok.ts'), 'export const x = 1;\n');
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('resolveContainedPath (SEC-325-D1)', () => {
  it('accepts relative paths inside the workspace', () => {
    expect(resolveContainedPath(root, 'src/ok.ts')).toBe(path.join(root, 'src', 'ok.ts'));
  });

  it('accepts absolute paths inside the workspace', () => {
    expect(resolveContainedPath(root, path.join(root, 'src', 'ok.ts'))).toBe(
      path.join(root, 'src', 'ok.ts'),
    );
  });

  it('rejects traversal outside the workspace', () => {
    expect(resolveContainedPath(root, '../evil.ts')).toBeNull();
    expect(resolveContainedPath(root, 'src/../../evil.ts')).toBeNull();
    expect(resolveContainedPath(root, '../../../../etc/passwd')).toBeNull();
  });

  it('rejects absolute paths outside the workspace (poisoned KB entry)', () => {
    expect(resolveContainedPath(root, '/home/user/.aws/credentials')).toBeNull();
    expect(resolveContainedPath(root, `${os.homedir()}/.ssh/id_rsa`)).toBeNull();
  });

  it('rejects symlink escapes pointing outside the workspace', () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'containment-outside-'));
    try {
      fs.writeFileSync(path.join(outside, 'secret.txt'), 'top-secret');
      // 'junction' works without elevation on Windows; plain dir symlink elsewhere.
      fs.symlinkSync(outside, path.join(root, 'src', 'extdir'), 'junction');
      expect(resolveContainedPath(root, path.join('src', 'extdir', 'secret.txt'))).toBeNull();
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it('rejects UNC, null-byte, and empty paths', () => {
    expect(resolveContainedPath(root, '\\\\share\\evil.ts')).toBeNull();
    expect(resolveContainedPath(root, 'src/a\0b.ts')).toBeNull();
    expect(resolveContainedPath(root, '')).toBeNull();
  });
});

describe('filterContainedCandidates (SEC-325-D1)', () => {
  it('treats mem_search output as untrusted (same containment rule)', () => {
    const out = filterContainedCandidates(
      [
        { name: 'evil', filePath: '/home/user/.aws/credentials', kind: 'class', source: 'mem_search' as const },
        { name: 'ok', filePath: 'src/ok.ts', kind: 'function', source: 'mem_search' as const },
      ],
      root,
    );
    expect(out.map((c) => c.name)).toEqual(['ok']);
  });

  it('isPathContained mirrors resolveContainedPath', () => {
    expect(isPathContained(root, 'src/ok.ts')).toBe(true);
    expect(isPathContained(root, '../evil.ts')).toBe(false);
  });
});
