/**
 * SA4E-406 — atomic writer regressions.
 *
 * A file symlink must stay a symlink: the candidate is committed to its REAL
 * target (same filesystem) instead of replacing the link entry with a regular
 * file. Windows cannot create file symlinks without elevation, so the link is
 * simulated deterministically at the fs boundary (lstat/realpath/rename).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PathLike } from 'fs';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { atomicWriteFileSync } from '../drawio-atomic-write';

const fsControl = vi.hoisted(() => ({
  linkPath: '',
  realTarget: '',
  renameTargets: [] as string[],
}));

vi.mock('fs', async importOriginal => {
  const actual = await importOriginal<typeof import('fs')>();
  const lstatSync = (target: PathLike, options?: unknown): fs.Stats => {
    if (String(target) === fsControl.linkPath) {
      return {
        isSymbolicLink: () => true,
        isFile: () => false,
        isDirectory: () => false,
        mode: 0o100644,
      } as fs.Stats;
    }
    return actual.lstatSync(target, options as never);
  };
  const realpathSync = (target: PathLike, options?: unknown): string => {
    if (String(target) === fsControl.linkPath) return fsControl.realTarget;
    return actual.realpathSync(target, options as never) as string;
  };
  const renameSync = (from: PathLike, to: PathLike): void => {
    fsControl.renameTargets.push(String(to));
    actual.renameSync(from, to);
  };
  return {
    ...actual,
    default: { ...actual, lstatSync, realpathSync, renameSync },
    lstatSync,
    realpathSync,
    renameSync,
  };
});

describe('SA4E-406 atomic write target resolution', () => {
  afterEach(() => {
    fsControl.linkPath = '';
    fsControl.realTarget = '';
    fsControl.renameTargets = [];
  });

  it('commits through an internal symlink to its real target and keeps the link', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drawio-symlink-'));
    try {
      const realTarget = path.join(dir, 'real.drawio');
      const linkPath = path.join(dir, 'link.drawio');
      fs.writeFileSync(realTarget, '<mxGraphModel><root/></mxGraphModel>', 'utf-8');
      fsControl.realTarget = realTarget;
      fsControl.linkPath = linkPath;

      atomicWriteFileSync(linkPath, '<mxGraphModel><root><mxCell id="1"/></root></mxGraphModel>');

      expect(fs.readFileSync(realTarget, 'utf-8')).toContain('id="1"');
      expect(fsControl.renameTargets).toEqual([realTarget]);
      expect(fs.existsSync(linkPath)).toBe(false);
      expect(fs.readdirSync(dir).filter(name => name.includes('.drawio-tmp-'))).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('renames a regular file directly onto its own path', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drawio-regular-'));
    try {
      const target = path.join(dir, 'plain.drawio');
      fs.writeFileSync(target, '<mxGraphModel><root/></mxGraphModel>', 'utf-8');

      atomicWriteFileSync(target, '<mxGraphModel><root><mxCell id="2"/></root></mxGraphModel>');

      expect(fs.readFileSync(target, 'utf-8')).toContain('id="2"');
      expect(fsControl.renameTargets).toEqual([target]);
      expect(fs.readdirSync(dir).filter(name => name.includes('.drawio-tmp-'))).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
