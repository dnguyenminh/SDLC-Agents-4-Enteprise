/**
 * SA4E-393 Addendum 5 — `verifyWorktree`: decides from DISK EVIDENCE ONLY whether
 * `base_dir` is a genuine linked worktree of a trusted repository (TDD E4/E11).
 * Step order: gitFile → trustedPrefix → admin → common → backlink → parent → placement.
 * Pure function over TrustDeps; never throws (unexpected errors → `io_error`),
 * never spawns a process, bounded by a total time budget checked between steps.
 */
import { fail, pass, readFailure, stepAdmin, stepBacklink, stepCommon } from './admin-steps';
import { parseGitdirPointer, statSig } from './git-files';
import { flavour, hasBadWinComponent, isShortNameAlias, isUncOrDevice, realpathOrNull } from './path-fold';
import { stepParent, stepPlacement, stepTrustedPrefix } from './trust-steps';
import type { StatLike, StepResult, TrustDeps, VerifyState, WorktreeReason, WorktreeVerdict } from './types';

const deny = (reason: WorktreeReason): WorktreeVerdict => ({ trusted: false, reason });

/** Lexical gate on `base_dir` BEFORE any fs call (UNC/device/ADS/reserved/relative). */
export function precheck(baseDir: string, platform: NodeJS.Platform): WorktreeReason | null {
  if (baseDir.includes('\0') || !flavour(platform).isAbsolute(baseDir)) return 'malformed';
  if (isUncOrDevice(baseDir, platform)) return 'unc_unsupported';
  return hasBadWinComponent(baseDir, platform) ? 'malformed' : null;
}

/** Step 1 — `.git` must be a regular file ≤ maxBytes holding a valid `gitdir:` pointer. */
function stepGitFile(s: VerifyState): StepResult {
  const { fs, platform, maxBytes } = s.d;
  if (isShortNameAlias(s.baseDir, fs, platform)) return fail('malformed');
  const realBase = realpathOrNull(fs, s.baseDir);
  if (realBase === null) return fail('not_a_worktree');
  const gitPath = flavour(platform).join(realBase, '.git');
  let st: StatLike;
  try { st = fs.lstat(gitPath); } catch { return fail('not_a_worktree'); }
  if (!st.isFile()) return fail('not_a_worktree'); // dir (clone/main), symlink, other: never followed
  const txt = fs.readSmall(gitPath, maxBytes);
  if (!txt.ok) return fail(readFailure(txt, 'not_a_worktree'));
  const p = parseGitdirPointer(txt.value, platform);
  return p.ok ? pass({ realBase, gitPath, gitSig: statSig(st), pointer: p.value }) : fail(p.reason);
}

const STEPS: ReadonlyArray<(s: VerifyState) => StepResult> = [
  stepGitFile, stepTrustedPrefix, stepAdmin, stepCommon, stepBacklink, stepParent, stepPlacement,
];

/** Verify `baseDir` (already `path.resolve`d by the caller). */
export function verifyWorktree(baseDir: string, d: TrustDeps): WorktreeVerdict {
  try {
    const pre = precheck(baseDir, d.platform);
    if (pre !== null) return deny(pre);
    const deadline = d.now() + d.budgetMs;
    let st: VerifyState = { baseDir, d };
    for (const step of STEPS) {
      if (d.now() > deadline) return deny('limit_exceeded'); // fail-closed budget (FR-WT12)
      const r = step(st);
      if (!r.ok) return deny(r.reason);
      st = { ...st, ...r.patch };
    }
    return accept(st);
  } catch {
    return deny('io_error');
  }
}

function accept(s: VerifyState): WorktreeVerdict {
  return {
    trusted: true, kind: s.kind!, repoRoot: s.trustRoot!,
    evidence: { realBase: s.realBase!, gitPath: s.gitPath!, gitSig: s.gitSig!, linkPath: s.linkPath!, linkSig: s.linkSig! },
  };
}
