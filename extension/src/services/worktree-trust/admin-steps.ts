/**
 * SA4E-393 Addendum 5 — verifier steps that read the admin directory inside the
 * (already prefix-checked) trusted repository: admin, commondir, back-link (TDD E4.2/E11.4).
 */
import { isBareRepoRoot } from './bare-layout';
import { parseBacklink, statSig } from './git-files';
import { flavour, foldKey, isUnderGitModules, realpathOrNull, samePath } from './path-fold';
import type { ReadResult, StepResult, VerifyState, WorktreeReason } from './types';

export const pass = (patch: Partial<VerifyState> = {}): StepResult => ({ ok: true, patch });
export const fail = (reason: WorktreeReason): StepResult => ({ ok: false, reason });

/** Map a failed evidence read to a reason (FIFO/dir/oversize/io → malformed family). */
export function readFailure(r: Extract<ReadResult, { ok: false }>, missing: WorktreeReason): WorktreeReason {
  if (r.reason === 'missing') return missing;
  return r.reason === 'limit_exceeded' ? 'limit_exceeded' : r.reason === 'io_error' ? 'io_error' : 'malformed';
}

/** Step 3: admin dir is a real directory directly below a `worktrees` folder. */
export function stepAdmin(s: VerifyState): StepResult {
  const { fs, platform } = s.d;
  const P = flavour(platform);
  const admin = realpathOrNull(fs, s.admin0!);
  if (admin === null) return fail('admin_missing');
  if (!fs.stat(admin).isDirectory()) return fail('malformed');
  if (foldKey(P.basename(P.dirname(admin)), platform) !== 'worktrees') return fail('submodule_or_unknown_layout');
  return pass({ admin, common0: P.dirname(P.dirname(admin)) });
}

/** Step 4: `commondir` (or fallback `<admin>/../..`) must equal `<admin>/../..` (blocks cross-repo forgery). */
export function stepCommon(s: VerifyState): StepResult {
  const { fs, platform } = s.d;
  const P = flavour(platform);
  const raw = commonCandidate(s);
  if (typeof raw !== 'string') return raw;
  const common = realpathOrNull(fs, raw);
  if (common === null) return fail('admin_missing');
  if (!samePath(common, s.common0!, platform)) return fail('commondir_mismatch');
  if (isUnderGitModules(common) || !isHeadFile(s, P.join(common, 'HEAD'))) return fail('submodule_or_unknown_layout');
  const main = foldKey(P.basename(common), platform) === '.git';
  if (!main && !isBareRepoRoot(s.d, common)) return fail('submodule_or_unknown_layout'); // SEC-WT-20
  return pass({ common, kind: main ? 'main' : 'bare', trustRoot: main ? P.dirname(common) : common });
}

function commonCandidate(s: VerifyState): string | StepResult {
  const P = flavour(s.d.platform);
  const cd = s.d.fs.readSmall(P.join(s.admin!, 'commondir'), s.d.maxBytes);
  if (!cd.ok) return cd.reason === 'missing' ? s.common0! : fail(readFailure(cd, 'malformed')); // OI-WT5 fallback
  const p = parseBacklink(cd.value, s.d.platform);
  return p.ok ? P.resolve(s.admin!, p.value) : fail(p.reason);
}

function isHeadFile(s: VerifyState, head: string): boolean {
  try { return s.d.fs.stat(head).isFile(); } catch { return false; }
}

/** Step 5: `<admin>/gitdir` must name exactly `<realBase>/.git` (string AND file identity, E11.4). */
export function stepBacklink(s: VerifyState): StepResult {
  const { fs, platform } = s.d;
  const P = flavour(platform);
  const linkPath = P.join(s.admin!, 'gitdir');
  const bl = fs.readSmall(linkPath, s.d.maxBytes);
  if (!bl.ok) return fail(readFailure(bl, 'backlink_missing'));
  const p = parseBacklink(bl.value, platform);
  if (!p.ok) return fail(p.reason);
  const target = realpathOrNull(fs, P.resolve(s.admin!, p.value));
  if (target === null) return fail('backlink_missing');
  if (!samePath(target, s.gitPath!, platform) || !sameFile(s, target)) return fail('backlink_mismatch');
  return pass({ linkPath, linkSig: statSig(fs.lstat(linkPath)) });
}

/** dev/ino equality; when either side reports 0 (FAT/exFAT, some network fs) fall back to the string compare. */
function sameFile(s: VerifyState, target: string): boolean {
  try {
    const a = s.d.fs.lstat(s.gitPath!);
    const b = s.d.fs.stat(target);
    if (a.ino === 0n || a.dev === 0n || b.ino === 0n || b.dev === 0n) return true;
    return a.dev === b.dev && a.ino === b.ino;
  } catch {
    return false;
  }
}
