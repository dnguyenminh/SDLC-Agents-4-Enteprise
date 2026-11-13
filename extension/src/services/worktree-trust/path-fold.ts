/* GENERATED from backend/src/shared/worktree-trust/path-fold.ts by scripts/sync-worktree-trust.mjs - DO NOT EDIT */
/**
 * SA4E-393 Addendum 5 — pure path helpers: case folding, UNC/device detection,
 * win32 component rules, containment. No fs access except {@link realpathOrNull}
 * and {@link isShortNameAlias} which receive an injected FsLike.
 */
import * as path from 'path';
import type { FsLike } from './types';

/** Platform-correct path flavour so win32 rules are testable on any host. */
export function flavour(platform: NodeJS.Platform): path.PlatformPath {
  return platform === 'win32' ? path.win32 : path.posix;
}

/** Case-fold only on win32 (the filesystem itself is case-insensitive there). */
export function foldKey(p: string, platform: NodeJS.Platform): string {
  return platform === 'win32' ? p.toLowerCase() : p;
}

/** `\\?\C:\x` → `C:\x`; `\\?\UNC\h\s` stays UNC-shaped (handled by isUncOrDevice). */
export function stripExtendedPrefix(p: string): string {
  return /^\\\\\?\\[A-Za-z]:/.test(p) ? p.slice(4) : p;
}

/** True for UNC (`\\h\s`, `//h/s`), `\\?\UNC\..` and device (`\\.\x`, `\\?\GLOBALROOT`) paths. win32 only. */
export function isUncOrDevice(p: string, platform: NodeJS.Platform): boolean {
  if (platform !== 'win32') return false;
  const s = stripExtendedPrefix(p.replace(/\//g, '\\'));
  return s.startsWith('\\\\');
}

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/** win32: alternate data streams, reserved device names, trailing dot/space in any component. */
export function hasBadWinComponent(p: string, platform: NodeJS.Platform): boolean {
  if (platform !== 'win32') return false;
  const rest = stripExtendedPrefix(p).replace(/^[A-Za-z]:/, '');
  if (rest.includes(':')) return true;
  return rest.split(/[\\/]+/).some((c) => c !== '' && c !== '.' && c !== '..' && (RESERVED.test(c) || /[. ]$/.test(c)));
}

/** Both paths must already be realpath results (or lexically resolved); compares folded, prefix-stripped. */
export function samePath(a: string, b: string, platform: NodeJS.Platform): boolean {
  return foldKey(stripExtendedPrefix(a), platform) === foldKey(stripExtendedPrefix(b), platform);
}

/** `cand` equals or lies below `root` (separator-boundary aware, folded on win32). */
export function isInsideFolded(root: string, cand: string, platform: NodeJS.Platform): boolean {
  const sep = flavour(platform).sep;
  const r = foldKey(stripExtendedPrefix(root), platform).replace(/[\\/]+$/, '');
  const c = foldKey(stripExtendedPrefix(cand), platform);
  return c === r || c.startsWith(r + sep) || (r === '' && c.startsWith(sep));
}

/** Lexical comparison key (no fs): resolve → strip → fold. */
export function lexKey(p: string, platform: NodeJS.Platform): string {
  return foldKey(stripExtendedPrefix(flavour(platform).resolve(p)), platform);
}

/** `.git/modules` segment pair anywhere in the path (submodule storage, E4.2 step 3). */
export function isUnderGitModules(p: string): boolean {
  return /[\\/]\.git[\\/]modules([\\/]|$)/i.test(p);
}

/** realpath that maps any failure to null (callers decide the reason). */
export function realpathOrNull(fs: FsLike, p: string): string | null {
  try { return fs.realpath(p); } catch { return null; }
}

const SHORT_NAME = /^[^.\s]{1,6}~\d+(\.\w{1,3})?$/;

/**
 * E11.4 / SEC-WT-18: reject only components that really are 8.3 ALIASES of another
 * name. A component with short-name shape is accepted when the native realpath of
 * its prefix ends with the very same name; unknown/failed → reject (fail-closed).
 */
export function isShortNameAlias(p: string, fs: FsLike, platform: NodeJS.Platform): boolean {
  if (platform !== 'win32') return false;
  const parts = stripExtendedPrefix(p).split(/[\\/]+/);
  for (let i = 1; i < parts.length; i++) {
    if (!SHORT_NAME.test(parts[i]!)) continue;
    if (!nativeNameEquals(parts.slice(0, i + 1).join('\\') + '\\', parts[i]!, fs)) return true;
  }
  return false;
}

function nativeNameEquals(prefix: string, name: string, fs: FsLike): boolean {
  try {
    const native = fs.realpathNative?.(prefix);
    if (native === undefined) return false;
    return path.win32.basename(native).toLowerCase() === name.toLowerCase();
  } catch {
    return false;
  }
}
