/**
 * SA4E-394 — Startup workspace allowlist (BR-12…BR-16, BR-19).
 *
 * Parses `MCP_WORKSPACE_ROOTS` (env) or `MCP_WORKSPACE_ROOTS_FILE` (line-based
 * config file) into an immutable in-memory Set of normalized absolute roots.
 * Loaded ONCE at startup (BR-13); changes require a restart (BR-17).
 * An empty/unset allowlist selects legacy single-root mode (BR-16).
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Logger } from 'pino';
import { isUncOrDevice } from './worktree-trust/path-fold.js';

/** Soft cap (TDD §6.1 / Open Question #5) — defensive only, no hard failure. */
const MAX_ROOTS = 100;
/** Config files larger than this are rejected (TDD §6.1). */
const MAX_CONFIG_FILE_BYTES = 64 * 1024;

export type AllowlistSource = 'env' | 'config_file' | 'none';

export class WorkspaceAllowlist {
  private constructor(
    private readonly roots: readonly string[],
    private readonly lookup: ReadonlySet<string>,
    private readonly legacyMode: boolean,
    private readonly warnings: readonly string[],
    readonly source: AllowlistSource,
  ) {}

  /**
   * Load once at startup (BR-13). Precedence: env var → config file → legacy
   * mode. Unreadable config degrades to legacy mode with a WARN (UC-2 EF-2) —
   * never blocks startup.
   */
  static load(legacyRoot: string, logger: Logger, env: NodeJS.ProcessEnv = process.env): WorkspaceAllowlist {
    const warnings: string[] = [];
    const raw = readRawAllowlist(logger, env, warnings);
    const tokens = raw === null ? [] : splitTokens(raw, logger, warnings);
    const roots = normalizeTokens(tokens, logger, warnings);
    const legacyMode = roots.length === 0; // P8 — BR-16
    if (legacyMode) {
      logger.info({ legacyRoot }, 'MCP_WORKSPACE_ROOTS empty — legacy single-root mode active');
    }
    const entries = legacyMode ? [path.resolve(legacyRoot)] : roots;
    // P7 — Set keys are case-folded on win32 so membership is case-insensitive
    // where the filesystem itself is case-insensitive.
    const lookup = new Set(entries.map(foldKey));
    return new WorkspaceAllowlist(entries, lookup, legacyMode, warnings, raw === null ? 'none' : sourceOf(env));
  }

  /**
   * O(1) membership check (BR-05); case-folded on win32 (P7 semantics).
   * The input is realpath'd when it exists so callers may pass the path in
   * whatever form they received it (P5 stored real paths in the Set).
   */
  contains(root: string): boolean {
    const resolved = path.resolve(root);
    if (this.lookup.has(foldKey(resolved))) return true;
    if (isUncOrDevice(resolved, process.platform)) return false; // SEC-WT-2: never realpath an unlisted UNC/device path
    try {
      return this.lookup.has(foldKey(fs.realpathSync(resolved)));
    } catch {
      return false;
    }
  }

  /** Pure folded Set lookup (no fs): lets a literally listed UNC root keep working (SEC-WT-2). */
  hasLiteral(root: string): boolean { return this.lookup.has(foldKey(path.resolve(root))); }

  isLegacyMode(): boolean { return this.legacyMode; }        // BR-16
  /** Startup log snapshot (BR-19). */
  snapshot(): readonly string[] { return [...this.roots]; }
  get size(): number { return this.roots.length; }
  get startupWarnings(): readonly string[] { return this.warnings; }
}

/** P1 — read raw allowlist: env var first, then config file, else null. */
function readRawAllowlist(
  logger: Logger, env: NodeJS.ProcessEnv, warnings: string[],
): string | null {
  const envValue = env['MCP_WORKSPACE_ROOTS'];
  if (envValue !== undefined && envValue.trim() !== '') return envValue;
  const fileValue = env['MCP_WORKSPACE_ROOTS_FILE'];
  if (!fileValue) return null;
  return readConfigFile(fileValue, logger, warnings);
}

/** UC-2 AF-2 — line-based format: one root per line, `#` comments, blanks skipped. */
function readConfigFile(filePath: string, logger: Logger, warnings: string[]): string | null {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > MAX_CONFIG_FILE_BYTES) {
      warnings.push(`config file '${filePath}' exceeds 64 KB — ignored (legacy mode)`);
      logger.warn({ file: filePath }, 'MCP_WORKSPACE_ROOTS_FILE too large — treating as empty');
      return null;
    }
    const lines = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/);
    const entries = lines.map((l) => l.replace(/#.*$/, '').trim()).filter((l) => l.length > 0);
    return entries.join(path.delimiter);
  } catch (err) {
    const msg = (err as Error).message;
    warnings.push(`config file '${filePath}' unreadable: ${msg} — legacy mode fallback`);
    logger.warn({ file: filePath, err: msg }, 'MCP_WORKSPACE_ROOTS_FILE unreadable — legacy mode fallback');
    return null;
  }
}

/** P2/P3 — split on the platform delimiter; trim; skip empty tokens (WARN). */
function splitTokens(raw: string, logger: Logger, warnings: string[]): string[] {
  const tokens: string[] = [];
  let emptySeen = false;
  for (const token of raw.split(path.delimiter)) {
    const trimmed = token.trim();
    if (trimmed === '') { emptySeen = true; continue; }
    tokens.push(trimmed);
  }
  if (emptySeen) {
    warnings.push('empty allowlist token skipped');
    logger.warn('MCP_WORKSPACE_ROOTS contains an empty token — skipped');
  }
  return tokens;
}

/** P4–P7 — normalize to absolute, realpath where it exists, validate, dedupe. */
function normalizeTokens(tokens: string[], logger: Logger, warnings: string[]): string[] {
  const seen = new Set<string>();
  const roots: string[] = [];
  for (const token of tokens.slice(0, MAX_ROOTS)) {
    const resolved = realpathIfExists(path.resolve(token), logger, warnings);
    const key = foldKey(resolved);
    if (seen.has(key)) continue; // P7 — dedupe (case-insensitive on win32)
    seen.add(key);
    validateEntry(resolved, logger, warnings);
    roots.push(resolved);
  }
  if (tokens.length > MAX_ROOTS) {
    warnings.push(`allowlist truncated to first ${MAX_ROOTS} entries`);
    logger.warn({ cap: MAX_ROOTS }, 'MCP_WORKSPACE_ROOTS exceeds soft cap — extra entries ignored');
  }
  return roots;
}

/** P5 — resolve symlinks where the entry exists; ENOENT keeps the resolved path. */
function realpathIfExists(entry: string, logger: Logger, warnings: string[]): string {
  try {
    return fs.realpathSync(entry);
  } catch {
    warnings.push(`allowlist entry '${entry}' does not exist — realpath unavailable`);
    logger.debug({ entry }, 'allowlist entry realpath unavailable — keeping resolved path');
    return entry;
  }
}

/** P6 — validate exists && is a directory; WARN naming the entry; retained. */
function validateEntry(entry: string, logger: Logger, warnings: string[]): void {
  try {
    if (fs.statSync(entry).isDirectory()) return;
    const reason = 'is not a directory';
    warnings.push(`allowlist entry '${entry}' ${reason}`);
    logger.warn({ entry, reason }, 'Allowlist entry is not a directory — startup continues (BR-15)');
  } catch {
    const reason = 'does not exist or is not a directory';
    warnings.push(`allowlist entry '${entry}' ${reason}`);
    logger.warn({ entry, reason }, 'Allowlist entry does not exist — startup continues (BR-15)');
  }
}

function sourceOf(env: NodeJS.ProcessEnv): AllowlistSource {
  const envValue = env['MCP_WORKSPACE_ROOTS'];
  return envValue !== undefined && envValue.trim() !== '' ? 'env' : 'config_file';
}

/** Case-fold only on win32 (P7) — Set keys are normalized absolute paths. */
function foldKey(p: string): string {
  return process.platform === 'win32' ? p.toLowerCase() : p;
}
