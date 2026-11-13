/**
 * SA4E-393 Addendum 5 — worktree-trust shared types (TDD E2.2 / E11).
 * The library imports only `fs` and `path`; collaborators arrive through these
 * interfaces (DIP) so the verifier is unit-testable with fake file systems.
 */

export type WorktreeReason =
  | 'not_a_worktree' | 'malformed' | 'limit_exceeded' | 'unc_unsupported' | 'io_error'
  | 'admin_missing' | 'submodule_or_unknown_layout' | 'commondir_mismatch'
  | 'backlink_missing' | 'backlink_mismatch' | 'parent_not_trusted' | 'bare_not_registered'
  | 'disabled';

/** Disk evidence a positive verdict was based on; used by the cache to detect staleness. Server-side only. */
export interface TrustEvidence {
  realBase: string;
  gitPath: string;
  gitSig: string;
  linkPath: string;
  linkSig: string;
}

export type WorktreeVerdict =
  | { trusted: true; kind: 'main' | 'bare'; repoRoot: string; evidence: TrustEvidence }
  | { trusted: false; reason: WorktreeReason };

/** Subset of bigint `fs.Stats` the library relies on. */
export interface StatLike {
  dev: bigint; ino: bigint; size: bigint; mtimeNs: bigint; ctimeNs: bigint;
  isFile(): boolean; isDirectory(): boolean; isSymbolicLink(): boolean;
}

export type ReadResult =
  | { ok: true; value: string }
  | { ok: false; reason: 'missing' | 'limit_exceeded' | 'not_a_worktree' | 'io_error' };

/** Injectable fs surface (tests fake it to count calls). All methods may throw Node errors. */
export interface FsLike {
  lstat(p: string): StatLike;
  stat(p: string): StatLike;
  realpath(p: string): string;
  /** Windows only: expands 8.3 short names (E11.4). Optional; absent = alias check cannot confirm → reject. */
  realpathNative?(p: string): string;
  /** lstat-first bounded read; never opens non-regular files (E11.1). */
  readSmall(p: string, maxBytes: number): ReadResult;
}

export interface TrustLogger {
  debug(obj: Record<string, unknown>, msg: string): void;
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
}

export interface TrustDeps {
  fs: FsLike;
  platform: NodeJS.Platform;
  /** Monotonic ms clock. */
  now(): number;
  /** Allowlist membership of a real path (semantics mirror the backend's WorkspaceAllowlist.contains; the extension owns this code). */
  isAllowlisted(realPath: string): boolean;
  /** Configured allowlist roots (enumeration for the trusted-first prefix gate, E11.1). */
  allowlistRoots(): readonly string[];
  /** Raw (already filtered) open workspace folders; realpath-ed inside the verifier. */
  openFolders(): readonly string[];
  homedir(): string;
  budgetMs: number;
  maxBytes: number;
}

/** What the resolvers depend on (ISP: one method). */
export interface TrustPort { check(baseDirResolved: string): WorktreeVerdict }

/** Accumulated facts of one verification run (steps return patches, never mutate). */
export interface VerifyState {
  baseDir: string; d: TrustDeps;
  realBase?: string; gitPath?: string; gitSig?: string; pointer?: string;
  allowReal?: string[]; openReal?: string[]; parents?: ReadonlySet<string>;
  admin0?: string; admin?: string; common0?: string; common?: string;
  kind?: 'main' | 'bare'; trustRoot?: string; linkPath?: string; linkSig?: string;
}

export type StepResult = { ok: true; patch: Partial<VerifyState> } | { ok: false; reason: WorktreeReason };

export type PointerResult = { ok: true; value: string } | { ok: false; reason: 'malformed' | 'unc_unsupported' };

export const MAX_POINTER_CHARS = 1024;
export const MAX_OPEN_FOLDERS = 16;
