/**
 * SA4E-394 — MultiWorktreePathResolver core matrix (TDD §11 hooks; STC
 * TC-001…TC-008, TC-100…TC-105, TC-200…TC-210, TC-400…TC-408, TC-600, TC-602).
 * Verifies the normative pipeline: normalize → allowlist → existence →
 * resolve → containment-after-resolution, and byte-level error contracts.
 */

import * as fs from 'fs';
import * as path from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fc from 'fast-check';
import { MultiWorktreePathResolver } from '../multi-worktree-path-resolver.js';
import { WorkspaceAllowlist } from '../workspace-allowlist.js';
import { createWorktreeFixture, type MultiWorktreeFixture } from './multi-worktree-fixture.js';

let fx: MultiWorktreeFixture;
let allowlist: WorkspaceAllowlist;
let resolver: MultiWorktreePathResolver;

beforeAll(() => {
  fx = createWorktreeFixture();
  allowlist = WorkspaceAllowlist.load(fx.main, fx.logger, {
    MCP_WORKSPACE_ROOTS: fx.allowlistEnv,
  } as NodeJS.ProcessEnv);
  resolver = new MultiWorktreePathResolver(allowlist, fx.main, fx.logger);
});

afterAll(() => fx.cleanup());

describe('TC-001/TC-002 — cross-worktree success (AC1)', () => {
  it('resolves a relative file_path against the registered base_dir', () => {
    const r = resolver.resolve({ filePath: 'documents/SA4E-394/BRD.md', baseDir: fx.wtB });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.resolvedPath).toBe(path.join(fx.wtB, 'documents', 'SA4E-394', 'BRD.md'));
    expect(r.effectiveRoot).toBe(fx.wtB);
    expect(r.rootSource).toBe('base_dir');
  });

  it('accepts an absolute file_path within base_dir without re-prefixing (BR-04)', () => {
    const abs = path.join(fx.wtB, 'script.py');
    const r = resolver.resolve({ filePath: abs, baseDir: fx.wtB });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.resolvedPath).toBe(abs);
  });

  it('accepts in-root ../ traversal when the final path stays inside (TC-105, AF-5)', () => {
    const r = resolver.resolve({ filePath: 'tmp/../documents/SA4E-394/BRD.md', baseDir: fx.wtB });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.resolvedPath).toBe(path.join(fx.wtB, 'documents', 'SA4E-394', 'BRD.md'));
  });

  it('accepts filePath "." resolving to the root itself (TC-407, inclusive boundary)', () => {
    const r = resolver.resolve({ filePath: '.', baseDir: fx.wtB });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.resolvedPath).toBe(fx.wtB);
  });

  it('resolves the same relative path against wt-a and wt-b independently (TC-304, BR-18)', () => {
    for (const root of [fx.main, fx.wtA, fx.wtB]) {
      const r = resolver.resolve({ filePath: 'notes.txt', baseDir: root });
      if (root === fx.main) continue; // main has no such file check below — path math only
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(r.resolvedPath.startsWith(root + path.sep)).toBe(true);
    }
  });
});

describe('TC-200/TC-207 — unregistered base_dir rejected BEFORE any FS access (AC2, BR-05/23)', () => {
  it('returns PATH_REJECTED_OUTSIDE_ALLOWLIST with the verbatim FSD §3.1.6 message', () => {
    const r = resolver.resolve({ filePath: 'x.txt', baseDir: fx.wtUnreg });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('PATH_REJECTED_OUTSIDE_ALLOWLIST');
    expect(r.message).toBe(
      `PATH_REJECTED_OUTSIDE_ALLOWLIST: Workspace root '${fx.wtUnreg}' is not registered ` +
      'in the allowlist. Configure MCP_WORKSPACE_ROOTS to include this path.',
    );
  });

  it('rejects any base_dir when the allowlist is empty (legacy mode, EF-5)', () => {
    const emptyResolver = new MultiWorktreePathResolver(
      WorkspaceAllowlist.load(fx.main, fx.logger, {} as NodeJS.ProcessEnv), fx.main, fx.logger,
    );
    const r = emptyResolver.resolve({ filePath: 'notes.txt', baseDir: fx.wtB });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('PATH_REJECTED_OUTSIDE_ALLOWLIST');
  });

  it('rejects a sibling-prefix directory (TC-402, T9 — separator boundary)', () => {
    const sibling = fx.wtB + '-evil';
    fs.mkdirSync(sibling, { recursive: true });
    try {
      const r = resolver.resolve({ filePath: 'x.txt', baseDir: sibling });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('PATH_REJECTED_OUTSIDE_ALLOWLIST');
      const r2 = resolver.resolve({ filePath: path.join(sibling, 'x.txt'), baseDir: fx.wtB });
      expect(r2.ok).toBe(false);
    } finally {
      fs.rmSync(sibling, { recursive: true, force: true });
    }
  });

  it('rejects relative "." / ".." base_dir poisoning via normalization (TC-405, T8)', () => {
    for (const poison of ['.', '..']) {
      const r = resolver.resolve({ filePath: 'x.txt', baseDir: poison });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('PATH_REJECTED_OUTSIDE_ALLOWLIST');
    }
  });

  it('rejects non-string base_dir with a typed error, raw value never echoed (TC-406)', () => {
    for (const bad of [123, null, {}]) {
      const r = resolver.resolve({ filePath: 'x.txt', baseDir: bad as unknown });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).not.toContain(JSON.stringify(bad));
    }
  });
});

describe('TC-201/TC-205 — existence check AFTER allowlist (BR-06, BR-11)', () => {
  it('registered-format but missing root → FS_ERROR (never PATH_REJECTED_*)', () => {
    const r = resolver.resolve({ filePath: 'x.txt', baseDir: fx.wtGhost });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('FS_ERROR');
      expect(r.message).toBe(`FS_ERROR: Workspace root '${fx.wtGhost}' does not exist on filesystem`);
    }
  });

  it('registered plain FILE as root → FS_ERROR (not-directory)', () => {
    const r = resolver.resolve({ filePath: 'x.txt', baseDir: fx.plainFile });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('FS_ERROR');
  });
});

describe('TC-202/TC-203 — containment AFTER resolution (AC4, BR-07, T1/T2)', () => {
  it('../ traversal escaping base_dir is rejected with the containment message', () => {
    const r = resolver.resolve({ filePath: '../../../outside/evil.txt', baseDir: fx.wtB });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('PATH_REJECTED_OUTSIDE_ALLOWLIST');
      expect(r.message).toContain(`Resolved path '`);
      expect(r.message).toContain(`' is outside workspace root '${fx.wtB}'`);
    }
  });

  it('absolute file_path outside base_dir is rejected against whichever root', () => {
    for (const base of [fx.wtA, fx.wtB]) {
      const r = resolver.resolve({ filePath: path.join(fx.outside, 'evil.txt'), baseDir: base });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('PATH_REJECTED_OUTSIDE_ALLOWLIST');
    }
  });

  it('a deep traversal crafted to land back inside the root is accepted (TC-407b)', () => {
    const deep = path.join('tmp', '..'.repeat(6), path.basename(fx.wtB), 'script.py');
    const r = resolver.resolve({ filePath: deep, baseDir: fx.wtB });
    expect(r.ok).toBe(true);
  });
});

describe('TC-100/TC-204 — legacy branch (AC3, BR-03, C-3)', () => {
  it('base_dir omitted → resolved against the pinned legacy root with rootSource=legacy', () => {
    const r = resolver.resolve({ filePath: 'notes.txt' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.resolvedPath).toBe(path.join(fx.main, 'notes.txt'));
    expect(r.effectiveRoot).toBe(fx.main);
    expect(r.rootSource).toBe('legacy');
  });

  it('legacy absolute path outside pinned root → PATH_REJECTED_OUTSIDE_WORKSPACE', () => {
    const r = resolver.resolve({ filePath: path.join(fx.outside, 'evil.txt') });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('PATH_REJECTED_OUTSIDE_WORKSPACE');
      expect(r.message).toContain('outside backend workspace');
    }
  });

  it('legacy relative traversal is still rejected by resolveWithinWorkspace semantics', () => {
    const r = resolver.resolve({ filePath: '../outside/evil.txt' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('PATH_REJECTED_OUTSIDE_WORKSPACE');
  });

  it('empty/whitespace base_dir is treated as ABSENT → legacy branch (TC-401)', () => {
    for (const blank of ['', '   ']) {
      const r = resolver.resolve({ filePath: 'notes.txt', baseDir: blank });
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(r.rootSource).toBe('legacy');
    }
  });
});

describe('TC-101/TC-102 — alias handling (BR-10, T10)', () => {
  it('workspace_root alone behaves identically to base_dir', () => {
    const r = resolver.resolve({ filePath: 'script.py', workspaceRoot: fx.wtB });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.resolvedPath).toBe(path.join(fx.wtB, 'script.py'));
    expect(r.rootSource).toBe('base_dir');
  });

  it('when both are present base_dir wins deterministically (no merge)', () => {
    const r1 = resolver.resolve({ filePath: 'notes.txt', baseDir: fx.wtB, workspaceRoot: fx.wtA });
    const r2 = resolver.resolve({ filePath: 'notes.txt', baseDir: fx.wtA, workspaceRoot: fx.wtB });
    expect(r1.ok && r2.ok).toBe(true);
    if (r1.ok) expect(r1.effectiveRoot).toBe(fx.wtB);
    if (r2.ok) expect(r2.effectiveRoot).toBe(fx.wtA);
  });

  it('relative base_dir is normalized before the allowlist check (TC-103, BR-09)', () => {
    const prevCwd = process.cwd();
    process.chdir(fx.root); // server CWD = fixture root → 'wt-b' normalizes to {root}/wt-b
    try {
      const r = resolver.resolve({ filePath: 'script.py', baseDir: 'wt-b' });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.effectiveRoot).toBe(fx.wtB);
    } finally {
      process.chdir(prevCwd);
    }
  });
});

describe('TC-210 — error precedence matrix (BR-11)', () => {
  it('unregistered+missing → PATH_REJECTED (allowlist NEVER yields FS_ERROR)', () => {
    const r = resolver.resolve({ filePath: 'x.txt', baseDir: path.join(fx.root, 'never-registered') });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('PATH_REJECTED_OUTSIDE_ALLOWLIST');
  });

  it('registered+missing → FS_ERROR (existence NEVER yields PATH_REJECTED_*)', () => {
    const r = resolver.resolve({ filePath: 'x.txt', baseDir: fx.wtGhost });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('FS_ERROR');
  });

  it('registered+exists+escaping path → containment PATH_REJECTED (evaluated last)', () => {
    const r = resolver.resolve({ filePath: '../outside/x', baseDir: fx.wtB });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('is outside workspace root');
  });
});

describe('TC-602 — symlink escape rejected at runtime (T3, capability-guarded)', () => {
  it('a symlinked segment pointing outside the effective root is rejected', () => {
    if (process.platform === 'win32') return; // symlink creation needs privileges
    const link = path.join(fx.wtB, 'link-out');
    fs.symlinkSync(fx.outside, link, 'dir');
    try {
      const r = resolver.resolve({ filePath: 'link-out/evil.txt', baseDir: fx.wtB });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('PATH_REJECTED_OUTSIDE_ALLOWLIST');
    } finally {
      fs.rmSync(link, { force: true });
    }
  });
});

describe('TC-404 — log-forging sanitization (T6)', () => {
  it('control chars in base_dir/file_path are replaced in the message', () => {
    const evil = `${fx.wtUnreg}\nevil-log-line`;
    const r = resolver.resolve({ filePath: 'x.txt', baseDir: evil });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).not.toContain('\n');
      expect(r.message).toContain('?');
    }
  });
});

describe('TC-408 — PBT: containment invariant under randomized inputs (BR-07)', () => {
  it('every ok result has resolvedPath inside effectiveRoot; every !ok is typed+sanitized', () => {
    const pathSegment = fc
      .nat()
      .map((n) => (n % 6 === 0 ? '..' : n % 5 === 0 ? '.' : `seg${n % 4}`));
    const relativePath = fc
      .array(pathSegment, { minLength: 1, maxLength: 5 })
      .map((segs) => segs.join('/'));
    const baseDir = fc.constantFrom(fx.main, fx.wtA, fx.wtB);
    fc.assert(
      fc.property(relativePath, baseDir, (rel, base) => {
        const r = resolver.resolve({ filePath: rel, baseDir: base });
        if (r.ok) {
          const folded = (p: string) => (process.platform === 'win32' ? p.toLowerCase() : p);
          const within = folded(r.resolvedPath) === folded(r.effectiveRoot) ||
            folded(r.resolvedPath).startsWith(folded(r.effectiveRoot) + path.sep);
          return within;
        }
        return ['PATH_REJECTED_OUTSIDE_ALLOWLIST', 'PATH_REJECTED_OUTSIDE_WORKSPACE', 'FS_ERROR']
          .includes(r.code) && !r.message.includes('\n') && !r.message.includes('\r');
      }),
      { numRuns: 300, seed: 42 },
    );
  });
});

describe('TC-600 — resolve() latency budget (FSD §8: < 5 ms p95)', () => {
  it('p95 of the full base_dir pipeline stays well under 5 ms', () => {
    const samples: number[] = [];
    for (let i = 0; i < 200; i++) {
      const start = performance.now();
      resolver.resolve({ filePath: 'documents/SA4E-394/BRD.md', baseDir: fx.wtB });
      samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.floor(samples.length * 0.95)];
    expect(p95).toBeLessThan(5);
  });
});
