/**
 * SA4E-394 — WorkspaceAllowlist startup rules (TDD §4.2 P1–P9; STC TC-104,
 * TC-106…TC-109, TC-208, TC-302). Verifies env/config-file parsing, platform
 * delimiters, missing-entry warnings, dedupe, symlink realpath, legacy mode.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it, expect, afterEach } from 'vitest';
import pino from 'pino';
import { WorkspaceAllowlist } from '../workspace-allowlist.js';

const logger = pino({ level: 'silent' });
const tempFiles: string[] = [];

afterEach(() => {
  while (tempFiles.length > 0) {
    const f = tempFiles.pop()!;
    try { fs.rmSync(f, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

function tempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempFiles.push(dir);
  return dir;
}

describe('WorkspaceAllowlist.load — env source (BR-12, TC-109)', () => {
  it('parses platform-delimited roots into a normalized Set', () => {
    const base = tempDir('sa4e-roots-');
    const a = path.join(base, 'a');
    const b = path.join(base, 'b');
    fs.mkdirSync(a); fs.mkdirSync(b);
    const env = { MCP_WORKSPACE_ROOTS: `${a}${path.delimiter}${b}` } as NodeJS.ProcessEnv;
    const allowlist = WorkspaceAllowlist.load('/legacy-root', logger, env);
    expect(allowlist.snapshot()).toEqual([a, b]);
    expect(allowlist.contains(a)).toBe(true);
    expect(allowlist.contains(b)).toBe(true);
    expect(allowlist.isLegacyMode()).toBe(false);
  });

  it('trims whitespace around entries and resolves relative entries to absolute (P3/P4, BR-09)', () => {
    const cwd = process.cwd();
    const env = { MCP_WORKSPACE_ROOTS: '  ./tmp-rel-root  ' } as NodeJS.ProcessEnv;
    const allowlist = WorkspaceAllowlist.load('/legacy-root', logger, env);
    expect(allowlist.snapshot()).toEqual([path.resolve(cwd, 'tmp-rel-root')]);
  });
});

describe('WorkspaceAllowlist.load — config file source (TC-104, DISC-5)', () => {
  it('parses line-based format: one root per line, # comments, blank lines skipped', () => {
    const base = tempDir('sa4e-cfg-');
    const main = path.join(base, 'main');
    const wtB = path.join(base, 'wt-b');
    fs.mkdirSync(main); fs.mkdirSync(wtB);
    const cfgFile = path.join(base, 'roots.txt');
    fs.writeFileSync(cfgFile, `# comment line\n${main}\n\n   \n${wtB} # trailing comment\n`, 'utf-8');
    const env = { MCP_WORKSPACE_ROOTS_FILE: cfgFile } as NodeJS.ProcessEnv;
    const allowlist = WorkspaceAllowlist.load('/legacy-root', logger, env);
    expect(allowlist.snapshot()).toEqual([main, wtB]);
    expect(allowlist.source).toBe('config_file');
    expect(allowlist.isLegacyMode()).toBe(false);
  });

  it('env var takes precedence over the config file (source precedence)', () => {
    const base = tempDir('sa4e-prec-');
    const fromEnv = path.join(base, 'env-root');
    const fromFile = path.join(base, 'file-root');
    fs.mkdirSync(fromEnv); fs.mkdirSync(fromFile);
    const cfgFile = path.join(base, 'roots.txt');
    fs.writeFileSync(cfgFile, `${fromFile}\n`, 'utf-8');
    const env = {
      MCP_WORKSPACE_ROOTS: fromEnv,
      MCP_WORKSPACE_ROOTS_FILE: cfgFile,
    } as NodeJS.ProcessEnv;
    const allowlist = WorkspaceAllowlist.load('/legacy-root', logger, env);
    expect(allowlist.snapshot()).toEqual([fromEnv]);
    expect(allowlist.source).toBe('env');
  });

  it('unreadable config file → WARN + legacy mode fallback, startup not blocked (TC-208/EF-2)', () => {
    const env = { MCP_WORKSPACE_ROOTS_FILE: path.join(os.tmpdir(), 'no-such-roots-file-xyz.txt') } as NodeJS.ProcessEnv;
    const allowlist = WorkspaceAllowlist.load('/legacy-root', logger, env);
    expect(allowlist.isLegacyMode()).toBe(true);
    expect(allowlist.startupWarnings.length).toBeGreaterThan(0);
    expect(allowlist.contains('/legacy-root')).toBe(true);
  });
});

describe('WorkspaceAllowlist.load — validation rules (TC-106, BR-15/P6)', () => {
  it('missing + not-a-directory entries WARN but are retained; startup continues', () => {
    const base = tempDir('sa4e-miss-');
    const valid = path.join(base, 'valid');
    const ghost = path.join(base, 'ghost'); // missing
    const plainFile = path.join(base, 'plain.txt');
    fs.mkdirSync(valid);
    fs.writeFileSync(plainFile, 'x');
    const env = { MCP_WORKSPACE_ROOTS: [valid, ghost, plainFile].join(path.delimiter) } as NodeJS.ProcessEnv;
    const allowlist = WorkspaceAllowlist.load('/legacy-root', logger, env);
    expect(allowlist.snapshot()).toEqual([valid, ghost, plainFile]); // P6 — retained
    expect(allowlist.startupWarnings.length).toBeGreaterThanOrEqual(2);
    expect(allowlist.contains(valid)).toBe(true);
    expect(allowlist.contains(ghost)).toBe(true); // per-call BR-06 still guards
  });
});

describe('WorkspaceAllowlist.load — dedupe + symlinks (TC-107, BR-14/P5/P7)', () => {
  it('deduplicates repeated entries (Set semantics)', () => {
    const base = tempDir('sa4e-dup-');
    const a = path.join(base, 'a');
    fs.mkdirSync(a);
    const env = { MCP_WORKSPACE_ROOTS: `${a}${path.delimiter}${a}` } as NodeJS.ProcessEnv;
    const allowlist = WorkspaceAllowlist.load('/legacy-root', logger, env);
    expect(allowlist.snapshot()).toEqual([a]);
  });

  it('resolves a symlinked entry to its real path (capability-guarded)', () => {
    if (process.platform === 'win32') return; // symlink creation needs privileges
    const base = tempDir('sa4e-link-');
    const real = path.join(base, 'real');
    const link = path.join(base, 'link');
    fs.mkdirSync(real);
    fs.symlinkSync(real, link, 'dir');
    const env = { MCP_WORKSPACE_ROOTS: link } as NodeJS.ProcessEnv;
    const allowlist = WorkspaceAllowlist.load('/legacy-root', logger, env);
    expect(allowlist.snapshot()).toEqual([fs.realpathSync(real)]);
  });

  it('case-insensitive dedupe on win32, exact on POSIX (CFG-13)', () => {
    if (process.platform !== 'win32') return;
    const base = tempDir('sa4e-case-');
    const a = path.join(base, 'Alpha');
    fs.mkdirSync(a);
    const altCase = a.toLowerCase() === a ? a.toUpperCase() : a.toLowerCase();
    const env = { MCP_WORKSPACE_ROOTS: `${a}${path.delimiter}${altCase}` } as NodeJS.ProcessEnv;
    const allowlist = WorkspaceAllowlist.load('/legacy-root', logger, env);
    expect(allowlist.size).toBe(1);
  });
});

describe('WorkspaceAllowlist.load — legacy mode (TC-108, BR-16/P8)', () => {
  it('empty/only-delimiters env value → legacy single-root mode', () => {
    const env = { MCP_WORKSPACE_ROOTS: `${path.delimiter}${path.delimiter}` } as NodeJS.ProcessEnv;
    const allowlist = WorkspaceAllowlist.load('/legacy-root', logger, env);
    expect(allowlist.isLegacyMode()).toBe(true);
    expect(allowlist.snapshot()).toEqual([path.resolve('/legacy-root')]);
  });

  it('unset env (no config file) → legacy single-root mode', () => {
    const env = {} as NodeJS.ProcessEnv;
    const allowlist = WorkspaceAllowlist.load('/legacy-root', logger, env);
    expect(allowlist.isLegacyMode()).toBe(true);
    expect(allowlist.source).toBe('none');
  });
});

describe('WorkspaceAllowlist — loaded once (TC-302, BR-13)', () => {
  it('membership uses the startup snapshot; later env mutations are ignored', () => {
    const base = tempDir('sa4e-once-');
    const registered = path.join(base, 'registered');
    const addedLater = path.join(base, 'added-later');
    fs.mkdirSync(registered);
    const allowlist = WorkspaceAllowlist.load(
      '/legacy-root', logger,
      { MCP_WORKSPACE_ROOTS: registered } as NodeJS.ProcessEnv,
    );
    // Simulate a config change WITHOUT restart (no hot reload — BR-17).
    process.env.MCP_WORKSPACE_ROOTS = `${registered}${path.delimiter}${addedLater}`;
    try {
      expect(allowlist.contains(addedLater)).toBe(false);
    } finally {
      delete process.env.MCP_WORKSPACE_ROOTS;
    }
  });
});
