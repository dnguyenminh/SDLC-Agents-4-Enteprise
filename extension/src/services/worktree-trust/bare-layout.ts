/* GENERATED from backend/src/shared/worktree-trust/bare-layout.ts by scripts/sync-worktree-trust.mjs - DO NOT EDIT */
/** SA4E-393 Addendum 5 (SEC-WT-20) — recognises a genuine bare repository root. */
import { flavour } from './path-fold';
import type { TrustDeps } from './types';

/**
 * Genuine bare repo: NO `.git` entry at all, plus `HEAD` file, `objects/` and `refs/` directories.
 * Fail-closed: any unexpected fs answer means "not bare".
 */
export function isBareRepoRoot(d: TrustDeps, root: string): boolean {
  const P = flavour(d.platform);
  try {
    d.fs.lstat(P.join(root, '.git'));
    return false; // any .git entry → ordinary repo
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') return false;
  }
  try {
    return d.fs.stat(P.join(root, 'HEAD')).isFile()
      && d.fs.stat(P.join(root, 'objects')).isDirectory()
      && d.fs.stat(P.join(root, 'refs')).isDirectory();
  } catch {
    return false;
  }
}
