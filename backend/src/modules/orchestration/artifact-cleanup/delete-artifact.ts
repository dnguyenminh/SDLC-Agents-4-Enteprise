/**
 * OI-14 — delete-after-inline for local artifacts (TDD §9.1).
 *
 * Contract: after the backend has fully materialised an artifact's bytes, the
 * source file is deleted. Best-effort with identity verification (F-06):
 *  - the file is re-stat'ed and only unlinked when inode/size/mtime still match
 *    the pre-read snapshot, so a concurrently replaced file is never deleted;
 *  - ENOENT counts as success (already gone);
 *  - any other failure is logged as a warning and never fails the tool call —
 *    the bytes are already delivered and the periodic sweep (OI-15) retries.
 */

import * as fs from 'fs';
import * as path from 'path';

/** Minimal pino-shaped logger so this module stays decoupled from wiring. */
export interface CleanupLog {
  warn(obj: unknown, msg?: string): void;
}

/**
 * Delete the artifact at `filePath` after a successful read. `before` is the
 * stat snapshot taken immediately before the read (F-06 identity check).
 */
export function deleteArtifactAfterRead(filePath: string, before: fs.Stats, log?: CleanupLog): void {
  try {
    const after = fs.lstatSync(filePath);
    if (!identityMatches(before, after)) {
      warn(log, { artifact: path.basename(filePath) }, 'Artifact changed during read; skipped cleanup');
      return;
    }
    fs.unlinkSync(filePath);
  } catch (err: any) {
    if (err?.code === 'ENOENT') return; // already gone — success per TDD §9.1
    warn(log, { artifact: path.basename(filePath), err }, 'Artifact cleanup failed after inline');
  }
}

function identityMatches(before: fs.Stats, after: fs.Stats): boolean {
  return after.ino === before.ino && after.size === before.size && after.mtimeMs === before.mtimeMs;
}

function warn(log: CleanupLog | undefined, obj: unknown, msg: string): void {
  if (log) log.warn(obj as object, msg);
  else console.warn(`[artifact-cleanup] ${msg}`, obj);
}
