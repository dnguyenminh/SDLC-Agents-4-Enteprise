/**
 * SA4E-393 Addendum 5 — fail-closed symlink containment (SEC-WT-3 / 16 / 17, TDD E11.3).
 *
 * `realResolve` resolves a path component by component, realpath style: `..` pops the
 * already-resolved REAL prefix (never a textual component), link text is spliced in
 * front of the remaining components, and path.resolve/normalize is never applied to
 * link text. Missing tails are returned unresolved (a dangling link's target is the
 * creatable location). Any fs error other than ENOENT/ENOTDIR rejects.
 */
import * as fs from 'fs';
import { flavour, isInsideFolded, isUncOrDevice, stripExtendedPrefix } from './path-fold';

/** ELOOP-like bound shared by the hops of all components. */
export const MAX_LINK_DEPTH = 40;

export type EscapeReason = 'fs_error' | 'link_depth' | 'dotdot_after_missing' | 'real_outside';
export type Resolved = { real: string } | { escape: Exclude<EscapeReason, 'real_outside'> };
export interface EscapeInfo { reason: EscapeReason; real?: string }

/** The minimal fs surface used (injectable for tests). */
export interface LinkFs {
  lstatSync(p: string): { isSymbolicLink(): boolean };
  readlinkSync(p: string): string;
  realpathSync?(p: string): string;
}

interface State { prefix: string; todo: string[]; hops: number; missing: boolean }
type Fail = { escape: Exclude<EscapeReason, 'real_outside'> };

const splitter = (platform: NodeJS.Platform): RegExp => (platform === 'win32' ? /[\\/]+/ : /\/+/);
const code = (e: unknown): string | undefined => (e as NodeJS.ErrnoException).code;

function components(p: string, platform: NodeJS.Platform): string[] {
  return p.split(splitter(platform)).filter((c) => c !== '').reverse(); // stack: next component last
}

/** Physical location the OS would use for `abs`; UNC/device inputs fail with zero fs calls. */
export function realResolve(
  abs: string, fsx: LinkFs = fs, platform: NodeJS.Platform = process.platform,
): Resolved {
  const P = flavour(platform);
  if (isUncOrDevice(abs, platform) || !P.isAbsolute(abs)) return { escape: 'fs_error' };
  const root = P.parse(abs).root;
  const st: State = { prefix: root, todo: components(abs.slice(root.length), platform), hops: 0, missing: false };
  while (st.todo.length > 0) {
    const fail = step(st, fsx, platform);
    if (fail !== null) return fail;
  }
  return { real: st.prefix };
}

function step(st: State, fsx: LinkFs, platform: NodeJS.Platform): Fail | null {
  const P = flavour(platform);
  const c = st.todo.pop()!;
  if (c === '.') return null;
  if (c === '..') {
    if (st.missing) return { escape: 'dotdot_after_missing' };
    st.prefix = P.dirname(st.prefix);
    return null;
  }
  const next = P.join(st.prefix, c);
  if (st.missing) { st.prefix = next; return null; }
  return classify(st, next, fsx, platform);
}

function classify(st: State, next: string, fsx: LinkFs, platform: NodeJS.Platform): Fail | null {
  let isLink: boolean;
  try { isLink = fsx.lstatSync(next).isSymbolicLink(); } catch (e) {
    if (code(e) !== 'ENOENT' && code(e) !== 'ENOTDIR') return { escape: 'fs_error' };
    st.missing = true; st.prefix = next; return null;
  }
  if (!isLink) { st.prefix = next; return null; }
  return follow(st, next, fsx, platform);
}

function follow(st: State, link: string, fsx: LinkFs, platform: NodeJS.Platform): Fail | null {
  if (++st.hops > MAX_LINK_DEPTH) return { escape: 'link_depth' };
  let text: string;
  try { text = stripExtendedPrefix(fsx.readlinkSync(link)); } catch { return { escape: 'fs_error' }; }
  const P = flavour(platform);
  if (isUncOrDevice(text, platform) || (platform === 'win32' && /^[A-Za-z]:(?![\\/])/.test(text))) {
    return { escape: 'fs_error' };
  }
  if (P.isAbsolute(text)) {
    const root = P.parse(text).root;
    st.prefix = root === '\\' ? P.parse(st.prefix).root.slice(0, 2) + '\\' : root; // drive-relative `\x` keeps the drive
    text = text.slice(root.length);
  }
  st.todo.push(...components(text, platform));
  return null;
}

/**
 * Null when `target` really lies inside `root` (realpath vs realpath, SEC-WT-17);
 * otherwise the reason (and the real location when known).
 */
export function symlinkEscapeCheck(
  root: string, target: string, fsx: LinkFs = fs, platform: NodeJS.Platform = process.platform,
): EscapeInfo | null {
  let realRoot: string;
  try { realRoot = (fsx.realpathSync ?? fs.realpathSync)(root); } catch { return { reason: 'fs_error' }; }
  const r = realResolve(target, fsx, platform);
  if ('escape' in r) return { reason: r.escape };
  return isInsideFolded(realRoot, r.real, platform) ? null : { reason: 'real_outside', real: r.real };
}
