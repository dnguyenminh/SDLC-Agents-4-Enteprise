import { describe, it, expect, vi } from 'vitest';
import * as path from 'path';
import { FileScanner } from '../file-scanner';
import type { IFileLister } from '../types';
interface FakeNode {
  name: string;
  isDirectory: boolean;
  children?: FakeNode[];
}

function fakeListerFor(tree: FakeNode[]): IFileLister {
  return {
    listDir: vi.fn((dir: string, cursor: number, pageSize: number) => {
      const node = findNode(tree, dir);
      if (!node) return { entries: [] };
      const entries = (node.children ?? []).map((child) => ({
        name: child.name,
        isDirectory: child.isDirectory,
      }));
      const page = entries.slice(cursor, cursor + pageSize);
      const next = cursor + pageSize;
      return next < entries.length ? { entries: page, nextCursor: next } : { entries: page };
    }),
  };
}

function findNode(tree: FakeNode[], dir: string): FakeNode | undefined {
  if (dir === 'root') return { name: 'root', isDirectory: true, children: tree };
  const segments = dir.split(/[\\/]/);
  const name = segments[segments.length - 1];
  return (tree ?? []).find((child) => child.name === name);
}

const TREE: FakeNode[] = [
  { name: 'src', isDirectory: true, children: [
    { name: 'auth.ts', isDirectory: false },
    { name: 'session.ts', isDirectory: false },
  ] },
  { name: '.git', isDirectory: true, children: [
    { name: 'config', isDirectory: false },
  ] },
  { name: 'node_modules', isDirectory: true, children: [
    { name: 'pkg', isDirectory: true, children: [
      { name: 'index.js', isDirectory: false },
    ] },
  ] },
  { name: 'README.md', isDirectory: false },
  { name: 'dist', isDirectory: true, children: [
    { name: 'bundle.js', isDirectory: false },
  ] },
];

describe('FileScanner', () => {
  it('lists source files recursively and skips excluded dirs', () => {
    const scanner = new FileScanner(fakeListerFor(TREE));
    const files = scanner.listSourceFiles('root');

    expect(files).toContain(path.join('root', 'src', 'auth.ts'));
    expect(files).toContain(path.join('root', 'src', 'session.ts'));
    expect(files).toContain(path.join('root', 'README.md'));
    expect(files.some((f) => f.includes('.git'))).toBe(false);
    expect(files.some((f) => f.includes('node_modules'))).toBe(false);
    expect(files.some((f) => f.includes('dist'))).toBe(false);
  });

  it('TC-403: respects pagination while scanning (listDir called with pageSize)', () => {
    const lister = fakeListerFor(TREE);
    const scanner = new FileScanner(lister);
    scanner.listSourceFiles('root', { pageSize: 1 });

    const calls = (lister.listDir as ReturnType<typeof vi.fn>).mock.calls as unknown as Array<
      [string, number, number]
    >;
    expect(calls.length).toBeGreaterThan(0);
    calls.forEach(([, , pageSize]) => expect(pageSize).toBe(1));
  });

  it('caps the number of files at maxFiles', () => {
    const scanner = new FileScanner(fakeListerFor(TREE));
    const files = scanner.listSourceFiles('root', { maxFiles: 2 });
    expect(files).toHaveLength(2);
  });

  it('returns empty list for missing root', () => {
    const scanner = new FileScanner(fakeListerFor([]));
    expect(scanner.listSourceFiles('root')).toEqual([]);
  });
});
