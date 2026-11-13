/* GENERATED from backend/src/shared/worktree-trust/__tests__/worktree-fixture.ts by scripts/sync-worktree-trust.mjs - DO NOT EDIT */
/**
 * SA4E-393 Addendum 5 — real-git fixture helper (TDD E8). Production code never
 * spawns git; tests do, so verdicts are checked against genuine `git worktree add`
 * layouts. The tmp root is realpath-ed first (CI tmp may be symlinked / 8.3).
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { nodeFs } from '../../services/worktree-trust/git-files';
import type { TrustDeps } from '../../services/worktree-trust/types';

const tmpRoots: string[] = [];

/** Run git with a fixed identity; fails loudly when git is missing (no silent skip). */
export function git(cwd: string, args: string[]): string {
  const full = ['-c', 'protocol.file.allow=always', '-c', 'user.name=t', '-c', 'user.email=t@t.invalid', ...args];
  return execFileSync('git', full, { cwd, stdio: 'pipe', encoding: 'utf8' });
}

/** Fresh realpath-ed tmp directory, removed by {@link cleanupTmp}. */
export function makeTmp(): string {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sa4e393-wt-')));
  tmpRoots.push(dir);
  return dir;
}

export function cleanupTmp(): void {
  for (const d of tmpRoots.splice(0)) fs.rmSync(d, { recursive: true, force: true, maxRetries: 3 });
}

/** `git init` + one commit; returns the repo root. */
export function makeRepo(parent: string, name: string): string {
  const root = path.join(parent, name);
  fs.mkdirSync(root, { recursive: true });
  git(root, ['init', '-q', '-b', 'main']);
  fs.writeFileSync(path.join(root, 'README.md'), 'x\n');
  git(root, ['add', '.']);
  git(root, ['commit', '-q', '-m', 'init']);
  return fs.realpathSync(root);
}

/** `git worktree add -b <branch> <dest>`; returns the realpath of dest. */
export function addWorktree(repo: string, dest: string, branch: string): string {
  git(repo, ['worktree', 'add', '-q', '-b', branch, dest]);
  return fs.realpathSync(dest);
}

export interface DepsOptions {
  allowlist?: string[];
  open?: string[];
  platform?: NodeJS.Platform;
  home?: string;
  now?: () => number;
}

/** Real-fs TrustDeps; allowlist membership is exact (realpath-ed) like WorkspaceAllowlist. */
export function realDeps(o: DepsOptions = {}): TrustDeps {
  const allow = (o.allowlist ?? []).map((p) => fs.realpathSync(p));
  return {
    fs: nodeFs,
    platform: o.platform ?? process.platform,
    now: o.now ?? ((): number => performance.now()),
    isAllowlisted: (p: string): boolean => allow.includes(p),
    allowlistRoots: (): readonly string[] => allow,
    openFolders: (): readonly string[] => o.open ?? [],
    homedir: (): string => o.home ?? os.homedir(),
    budgetMs: 250,
    maxBytes: 4096,
  };
}
