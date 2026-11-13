/* GENERATED from backend/src/shared/worktree-trust/git-files.ts by scripts/sync-worktree-trust.mjs - DO NOT EDIT */
/**
 * SA4E-393 Addendum 5 — reading git evidence files safely (TDD E11.1).
 * `readSmall` is lstat-first: FIFOs, devices, directories and symlinks are never
 * opened, so a hostile `commondir`/`gitdir`/`.git` cannot block the event loop.
 * Pointer parsers are hand-written strict validators (no zod: the library is
 * dependency-free so it can be mirrored into the extension bundle, TDD E2.2).
 */
import * as fs from 'fs';
import { isUncOrDevice } from './path-fold';
import { MAX_POINTER_CHARS, type FsLike, type PointerResult, type ReadResult, type StatLike } from './types';

const GITDIR_LINE = /^gitdir: ([^\r\n]+)\r?\n?$/;
// eslint-disable-next-line no-control-regex -- intentional: reject every control character
const CONTROL = /[\u0000-\u001f\u007f]/;

/** Typed lstat-first bounded read; never throws. */
export function readSmall(p: string, maxBytes: number): ReadResult {
  let l: fs.BigIntStats;
  try { l = fs.lstatSync(p, { bigint: true }); } catch (e) { return failFrom(e); }
  if (!l.isFile()) return { ok: false, reason: 'not_a_worktree' };
  if (l.size > BigInt(maxBytes)) return { ok: false, reason: 'limit_exceeded' };
  return readOpened(p, l);
}

function failFrom(e: unknown): ReadResult {
  const code = (e as NodeJS.ErrnoException).code;
  return { ok: false, reason: code === 'ENOENT' || code === 'ENOTDIR' ? 'missing' : 'io_error' };
}

/** Open with O_NOFOLLOW/O_NONBLOCK where they exist (undefined on win32 → 0), then verify identity via fstat. */
function readOpened(p: string, l: fs.BigIntStats): ReadResult {
  const c = fs.constants;
  let fd = -1;
  try {
    fd = fs.openSync(p, c.O_RDONLY | (c.O_NONBLOCK ?? 0) | (c.O_NOFOLLOW ?? 0));
    const f = fs.fstatSync(fd, { bigint: true });
    if (!f.isFile() || f.dev !== l.dev || f.ino !== l.ino) return { ok: false, reason: 'not_a_worktree' };
    const buf = Buffer.alloc(Number(f.size));
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    return { ok: true, value: buf.subarray(0, n).toString('utf8') };
  } catch (e) {
    return failFrom(e);
  } finally {
    if (fd >= 0) fs.closeSync(fd);
  }
}

/** Production FsLike over Node's fs (bigint stats, JS realpath so both surfaces normalise alike). */
export const nodeFs: FsLike = {
  lstat: (p) => fs.lstatSync(p, { bigint: true }),
  stat: (p) => fs.statSync(p, { bigint: true }),
  realpath: (p) => fs.realpathSync(p),
  realpathNative: (p) => fs.realpathSync.native(p),
  readSmall,
};

/** Pointer text rules shared by `.git`, `commondir` and the back-link (1..1024 chars, no control chars, no UNC/device on win32). */
export function validatePointer(raw: string, platform: NodeJS.Platform): PointerResult {
  if (raw.length < 1 || raw.length > MAX_POINTER_CHARS || CONTROL.test(raw)) return { ok: false, reason: 'malformed' };
  if (isUncOrDevice(raw, platform)) return { ok: false, reason: 'unc_unsupported' };
  return { ok: true, value: raw };
}

/** `gitdir: <path>` single-line `.git` file content. Pure, never throws. */
export function parseGitdirPointer(text: string, platform: NodeJS.Platform): PointerResult {
  const m = GITDIR_LINE.exec(text);
  return m ? validatePointer(m[1]!, platform) : { ok: false, reason: 'malformed' };
}

/** One-line path file (`<admin>/gitdir`, `<admin>/commondir`): a single optional trailing newline only. */
export function parseBacklink(text: string, platform: NodeJS.Platform): PointerResult {
  return validatePointer(text.replace(/\r?\n$/, ''), platform);
}

/** `dev:ino:size:mtimeNs:ctimeNs` change signature (E11.6). */
export function statSig(s: StatLike): string {
  return `${s.dev}:${s.ino}:${s.size}:${s.mtimeNs}:${s.ctimeNs}`;
}

/** Signature of `p` via lstat, or `'absent'` when it cannot be stat-ed. */
export function sigOf(fsx: FsLike, p: string, sig: (s: StatLike) => string = statSig): string {
  try { return sig(fsx.lstat(p)); } catch { return 'absent'; }
}
