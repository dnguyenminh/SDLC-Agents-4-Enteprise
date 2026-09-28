import { describe, it, expect, vi } from 'vitest';
import { SummaryTreeBuilder } from '../summary-tree';
import { TokenCounter } from '../token-counter';
import type { DirEntry, IFileLister } from '../types';

const counter = new TokenCounter();

interface FakeNode {
  files: string[];
  dirs: Record<string, FakeNode>;
}

const TREE: FakeNode = {
  files: ['README.md'],
  dirs: {
    src: { files: ['auth.ts', 'session.ts', 'budget.ts'], dirs: {} },
    '.git': { files: ['config'], dirs: {} },
    node_modules: { files: ['pkg.js'], dirs: {} },
  },
};

function resolveNode(root: FakeNode, dir: string): FakeNode | undefined {
  if (dir === 'root') return root;
  let current = root;
  for (const segment of dir.split(/[\\/]/).slice(1)) {
    const next = current.dirs[segment];
    if (!next) return undefined;
    current = next;
  }
  return current;
}

function fakeLister(root: FakeNode): IFileLister {
  return {
    listDir: vi.fn((dir: string, cursor: number, pageSize: number) => {
      const node = resolveNode(root, dir);
      if (!node) return { entries: [] };
      const entries: DirEntry[] = [
        ...Object.keys(node.dirs).map((name) => ({ name, isDirectory: true })),
        ...node.files.map((name) => ({ name, isDirectory: false })),
      ];
      const page = entries.slice(cursor, cursor + pageSize);
      const next = cursor + pageSize;
      return next < entries.length ? { entries: page, nextCursor: next } : { entries: page };
    }),
  };
}

describe('SummaryTreeBuilder', () => {
  it('TC-101: builds a summary tree with file counts for GLOBAL queries', () => {
    const builder = new SummaryTreeBuilder({ lister: fakeLister(TREE), counter });
    const tree = builder.build('root');
    expect(tree.text).toContain('root/ (1 files)');
    expect(tree.text).toContain('src/ (3 files)');
    expect(tree.text).toContain('auth.ts');
    expect(tree.tokens).toBeGreaterThan(0);
  });

  it('excludes .git and node_modules from the tree', () => {
    const builder = new SummaryTreeBuilder({ lister: fakeLister(TREE), counter });
    const tree = builder.build('root');
    expect(tree.text).not.toContain('.git');
    expect(tree.text).not.toContain('node_modules');
  });

  it('respects the token cap and stops early', () => {
    const builder = new SummaryTreeBuilder({ lister: fakeLister(TREE), counter });
    const tree = builder.build('root', { maxTokens: 8 });
    expect(tree.text.split('\n').length).toBeLessThanOrEqual(4);
  });

  it('TC-403: reads directories through the paginated lister', () => {
    const lister = fakeLister(TREE);
    const builder = new SummaryTreeBuilder({ lister, counter });
    builder.build('root', { pageSize: 2 });
    const calls = (lister.listDir as ReturnType<typeof vi.fn>).mock.calls as unknown as Array<
      [string, number, number]
    >;
    expect(calls.length).toBeGreaterThan(1);
    calls.forEach(([, , pageSize]) => expect(pageSize).toBe(2));
  });

  it('limits depth to maxDepth', () => {
    const deep: FakeNode = { files: [], dirs: { a: { files: [], dirs: { b: { files: ['deep.ts'], dirs: {} } } } } };
    const builder = new SummaryTreeBuilder({ lister: fakeLister(deep), counter });
    const tree = builder.build('root', { maxDepth: 1 });
    expect(tree.text).toContain('a/');
    expect(tree.text).not.toContain('b/');
  });

  it('handles missing root directory', () => {
    const builder = new SummaryTreeBuilder({ lister: fakeLister(TREE), counter });
    const tree = builder.build('root/missing');
    expect(tree.text).toContain('missing/ (0 files)');
  });
});
