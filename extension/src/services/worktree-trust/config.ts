/**
 * SA4E-393 Addendum 5 — trust configuration (TDD E3 OI-WT1/3, E11.7, E11.8).
 * Pure over an injected env. Switch semantics: effective = env AND setting;
 * either source can disable, neither can override a disable; unknown env
 * values fail CLOSED (off) with a warning flag.
 */
import * as path from 'path';
import { MAX_OPEN_FOLDERS, type FsLike } from './types';
import { foldKey, flavour } from './path-fold';

export interface FlagResult { enabled: boolean; invalid: boolean }

const ON = new Set(['1', 'true', 'on', 'yes']);
const OFF = new Set(['0', 'false', 'off', 'no']);

/** Parse `MCP_WORKTREE_AUTOTRUST`: unset/empty → on; known tokens by case-insensitive trim; anything else → off + invalid. */
export function parseAutotrustFlag(value: string | undefined): FlagResult {
  const v = (value ?? '').trim().toLowerCase();
  if (v === '' || ON.has(v)) return { enabled: true, invalid: false };
  return { enabled: false, invalid: !OFF.has(v) };
}

export interface TrustConfig {
  /** Effective switch (env AND setting); a throwing setting reader disables. */
  enabled(): boolean;
  /** True when the env flag held an unrecognised value (service logs one warning). */
  readonly invalidFlag: boolean;
}

/** Build the config once at construction; `settingEnabled` is the optional host setting (extension). */
export function loadTrustConfig(env: NodeJS.ProcessEnv, settingEnabled?: () => boolean): TrustConfig {
  const flag = parseAutotrustFlag(env['MCP_WORKTREE_AUTOTRUST']);
  return {
    enabled: () => flag.enabled && readSetting(settingEnabled),
    invalidFlag: flag.invalid,
  };
}

function readSetting(fn: (() => boolean) | undefined): boolean {
  if (fn === undefined) return true;
  try { return fn() === true; } catch { return false; }
}

/**
 * SEC-WT-11: an open folder may act as a parent only when it is an existing directory
 * containing a `.git` directory, and is neither a filesystem root nor the home directory.
 */
export function filterOpenFolders(
  raw: readonly string[], fsx: FsLike, platform: NodeJS.Platform, home: string,
): string[] {
  const P = flavour(platform);
  return raw.slice(0, MAX_OPEN_FOLDERS).filter((entry) => {
    const abs = P.resolve(entry);
    if (P.parse(abs).root === abs || foldKey(abs, platform) === foldKey(P.resolve(home), platform)) return false;
    try { return fsx.stat(abs).isDirectory() && fsx.lstat(P.join(abs, '.git')).isDirectory(); } catch { return false; }
  });
}
