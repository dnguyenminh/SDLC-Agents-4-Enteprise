/**
 * SA4E-393 Addendum 5 — verifier steps that decide WHO trusts the repository:
 * trusted-first lexical gate (E11.1), parent trust (BR-WT4/12) and placement (E11.5).
 */
import { fail, pass } from './admin-steps.js';
import { isBareRepoRoot } from './bare-layout.js';
import { flavour, foldKey, hasBadWinComponent, isInsideFolded, isUncOrDevice, isUnderGitModules, lexKey, realpathOrNull, samePath } from './path-fold.js';
import type { StepResult, TrustDeps, VerifyState } from './types.js';

/** realpaths of configured roots; UNC/device entries are skipped before any fs call (E11.2). */
function realList(d: TrustDeps, roots: readonly string[]): string[] {
  const usable = roots.filter((r) => !isUncOrDevice(r, d.platform));
  return usable.map((r) => realpathOrNull(d.fs, r)).filter((r): r is string => r !== null);
}

/** `<S>/.git/worktrees` and `<S>/worktrees` for both spellings of every trusted root. */
function parentSet(d: TrustDeps, roots: readonly string[], reals: readonly string[]): { ok: Set<string>; notBare: Set<string> } {
  const P = flavour(d.platform);
  const ok = new Set<string>();
  const notBare = new Set<string>();
  for (const s of [...roots.map((r) => P.resolve(r)), ...reals]) {
    ok.add(lexKey(P.join(s, '.git', 'worktrees'), d.platform));
    // SEC-WT-20: `<S>/worktrees` is a registration folder only when S is a genuine bare repo.
    (isBareRepoRoot(d, s) ? ok : notBare).add(lexKey(P.join(s, 'worktrees'), d.platform));
  }
  return { ok, notBare };
}

/**
 * Step 2 — trusted-first: the pointer's parent dir must lexically be a trusted repo's
 * worktrees folder BEFORE any fs call touches the pointer target (no FIFO/UNC/hang reachable).
 */
export function stepTrustedPrefix(s: VerifyState): StepResult {
  const { d } = s;
  const P = flavour(d.platform);
  const lex = P.resolve(s.realBase!, s.pointer!);
  if (isUncOrDevice(lex, d.platform) || hasBadWinComponent(lex, d.platform)) return fail('unc_unsupported');
  const allow = d.allowlistRoots();
  const open = d.openFolders();
  const allowReal = realList(d, allow);
  const openReal = realList(d, open);
  const parents = parentSet(d, [...allow, ...open], [...allowReal, ...openReal]);
  const key = lexKey(P.dirname(lex), d.platform);
  if (parents.ok.has(key)) return pass({ admin0: lex, allowReal, openReal, parents: parents.ok });
  if (parents.notBare.has(key)) return fail('submodule_or_unknown_layout');
  return fail(isUnderGitModules(lex) ? 'submodule_or_unknown_layout' : 'parent_not_trusted');
}

/** Step 6 — the repo itself must be allowlisted or an open folder (bare: allowlisted only). */
export function stepParent(s: VerifyState): StepResult {
  const { d } = s;
  if (d.isAllowlisted(s.trustRoot!)) return pass();
  if (s.kind === 'bare') return fail('bare_not_registered');
  return s.openReal!.some((f) => samePath(f, s.trustRoot!, d.platform)) ? pass() : fail('parent_not_trusted');
}

/** Step 7 — where a trusted worktree may live (E11.5); rejects overlap with repo/roots/home. */
export function stepPlacement(s: VerifyState): StepResult {
  const { d } = s;
  const base = s.realBase!;
  const roots = [...s.allowReal!, ...s.openReal!, s.trustRoot!];
  const overlapsRepo = isInsideFolded(base, s.common!, d.platform) || isInsideFolded(s.common!, base, d.platform);
  const coversRoot = roots.some((r) => isInsideFolded(base, r, d.platform));
  return overlapsRepo || coversRoot || coversHome(base, d) ? fail('submodule_or_unknown_layout') : pass();
}

function coversHome(base: string, d: TrustDeps): boolean {
  const P = flavour(d.platform);
  if (P.parse(base).root === base) return true;
  const home = realpathOrNull(d.fs, d.homedir()) ?? P.resolve(d.homedir());
  return foldKey(home, d.platform) === foldKey(base, d.platform) || isInsideFolded(base, home, d.platform);
}
