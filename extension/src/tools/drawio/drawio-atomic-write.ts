/**
 * SA4E-406 — atomic draw.io file commit.
 *
 * The candidate is written to a controlled temporary directory on the SAME
 * filesystem and then renamed over the target. A failed write/rename therefore
 * leaves the original bytes untouched. No persistent backup or sidecar file is
 * created: the temporary directory is removed in every exit path.
 */
import * as fs from 'fs';
import * as path from 'path';

export type DrawioFileContent = string | Buffer;

/** Atomically replace `filePath` with validated candidate bytes. */
export function atomicWriteFileSync(filePath: string, content: DrawioFileContent): void {
  const target = resolveWriteTarget(filePath);
  const parent = path.dirname(target);
  const tempDir = fs.mkdtempSync(path.join(parent, '.drawio-tmp-'));
  const tempFile = path.join(tempDir, 'candidate.drawio');
  try {
    writeCandidate(tempFile, content);
    preserveMode(target, tempFile);
    fs.renameSync(tempFile, target);
  } finally {
    removeTempDir(tempDir);
  }
}

/** Resolve a symlink to its real target so the link itself is preserved. */
function resolveWriteTarget(filePath: string): string {
  let symbolic = false;
  try {
    symbolic = fs.lstatSync(filePath).isSymbolicLink();
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (!symbolic) return filePath;
  try {
    return fs.realpathSync(filePath);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`FS_ERROR: Failed to resolve symlink target: ${detail}`);
  }
}

/** Write the candidate in its temporary file, preserving text encoding. */
function writeCandidate(tempFile: string, content: DrawioFileContent): void {
  if (typeof content === 'string') fs.writeFileSync(tempFile, content, 'utf-8');
  else fs.writeFileSync(tempFile, content);
}

/** Preserve the target's permission bits when the platform exposes them. */
function preserveMode(filePath: string, tempFile: string): void {
  try {
    fs.chmodSync(tempFile, fs.statSync(filePath).mode);
  } catch {
    // A missing target or a platform without POSIX modes is not a write error.
  }
}

/** Remove the controlled temporary directory; force makes cleanup idempotent. */
function removeTempDir(tempDir: string): void {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (cleanupError: unknown) {
    console.error('[drawio-atomic-write] Temporary cleanup failed:', cleanupError);
  }
}
