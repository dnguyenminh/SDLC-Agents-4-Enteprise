import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { suggestExistingPaths } from '../path-suggestion.js';

const fwd = (p: string): string => p.replace(/\\/g, '/');

describe('path-suggestion (did-you-mean for not-found errors)', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'path-sug-'));
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('suggests the exact file in the parent dir using its real casing', () => {
    fs.writeFileSync(path.join(root, 'RealFile.ts'), 'x');
    const out = suggestExistingPaths(root, path.join(root, 'realfile.ts'));
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(fwd(path.join(root, 'RealFile.ts')));
  });

  it('finds the UAT 17/10 case: file lives one level deeper (__tests__/)', () => {
    const handlers = path.join(root, 'handlers');
    fs.mkdirSync(path.join(handlers, '__tests__'), { recursive: true });
    fs.writeFileSync(path.join(handlers, '__tests__', 'backend-settings-handler.test.ts'), 'x');
    const out = suggestExistingPaths(root, path.join(handlers, 'backend-settings-handler.test.ts'));
    expect(out[0]).toBe(fwd(path.join(handlers, '__tests__', 'backend-settings-handler.test.ts')));
  });

  it('falls back to fuzzy matches for mild typos', () => {
    fs.writeFileSync(path.join(root, 'ChatHtmlBuilder.ts'), 'x');
    fs.writeFileSync(path.join(root, 'unrelated-file.txt'), 'x');
    const out = suggestExistingPaths(root, path.join(root, 'ChatHtmlBuildr.ts'));
    expect(out).toContain(fwd(path.join(root, 'ChatHtmlBuilder.ts')));
  });

  it('accepts workspace-relative missing paths', () => {
    fs.mkdirSync(path.join(root, 'src'));
    fs.writeFileSync(path.join(root, 'src', 'index.ts'), 'x');
    const out = suggestExistingPaths(root, 'src/indedx.ts');
    expect(out).toContain(fwd(path.join(root, 'src', 'index.ts')));
  });

  it('respects maxSuggestions and orders best match first', () => {
    for (const n of ['a-one.ts', 'a-two.ts', 'a-three.ts', 'a-four.ts']) {
      fs.writeFileSync(path.join(root, n), 'x');
    }
    const out = suggestExistingPaths(root, path.join(root, 'a-one.ts'), 2);
    expect(out.length).toBeLessThanOrEqual(2);
    expect(out[0]).toBe(fwd(path.join(root, 'a-one.ts')));
  });

  it('returns [] for empty input and missing parents (never throws)', () => {
    expect(suggestExistingPaths(root, '')).toEqual([]);
    expect(suggestExistingPaths('', 'x.ts')).toEqual([]);
    expect(suggestExistingPaths(root, path.join(root, 'no-such-dir', 'x.ts'))).toEqual([]);
  });

  it('ignores noisy directories (node_modules) when scanning one level deeper', () => {
    const handlers = path.join(root, 'handlers');
    fs.mkdirSync(path.join(handlers, 'node_modules'), { recursive: true });
    fs.writeFileSync(path.join(handlers, 'node_modules', 'thing.test.ts'), 'x');
    const out = suggestExistingPaths(root, path.join(handlers, 'thing.test.ts'));
    expect(out).toEqual([]);
  });
});
