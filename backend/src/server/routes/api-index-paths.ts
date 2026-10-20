/**
 * Index temp-path safety helpers — extracted from api-index.ts (BR-18).
 * SA4E-300 GAP 1: sanitized cross-platform temp paths + traversal-safe resolution.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadConfig } from '../../config/index.js';

export interface SourceFile {
  path: string;
  content: string;
  gitHash?: string;
  checksum?: string;
}
export interface IndexScope { projectId: string; workspace: string }

/**
 * SA4E-300 GAP 1: Sanitize a single path segment (userId/projectId) before
 * joining it into a filesystem path. Strips every char outside [A-Za-z0-9._-];
 * falls back when the result is empty or '.'/'..'.
 */
export function sanitizePathSegment(segment: string | undefined, fallback: string): string {
  const cleaned = (segment ?? '').replace(/[^A-Za-z0-9._-]/g, '');
  if (!cleaned || cleaned === '.' || cleaned === '..') return fallback;
  return cleaned;
}

/**
 * SA4E-300 GAP 1: Cross-platform temp base — prefers config.indexTempDir
 * (CODE_INTEL_INDEX_TEMP_DIR or os.tmpdir()/CodeIntel), keeps the
 * {userId}/{projectId}/{subdir} structure with sanitized segments.
 */
export function resolveIndexTempBase(
  userId: string | undefined,
  projectId: string | undefined,
  subdir: string,
): string {
  let base: string | undefined;
  try {
    base = loadConfig().indexTempDir;
  } catch {
    base = undefined;
  }
  if (!base) base = process.env.CODE_INTEL_INDEX_TEMP_DIR || path.join(os.tmpdir(), 'CodeIntel');
  const safeUser = sanitizePathSegment(userId, 'local-dev');
  const safeProject = sanitizePathSegment(projectId, 'default');
  return path.join(base, safeUser, safeProject, subdir);
}

/**
 * SA4E-300 GAP 1: Resolve a client-supplied relative path safely under tempBase.
 * Returns the absolute target path, or null when the input is unsafe/escaping.
 * Catches absolute, '..' traversal (incl. backslash + percent-encoded), drive
 * letters, null bytes, and verifies path.relative stays inside tempBase.
 */
export function resolveSafeTargetPath(tempBase: string, rawPath: string): string | null {
  if (!rawPath || typeof rawPath !== 'string') return null;
  if (rawPath.includes('\0')) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    decoded = rawPath;
  }
  // Reject Windows drive-absolute on any platform (C:\, C:/)
  if (/^[A-Za-z]:[/\\]/.test(decoded) || /^[A-Za-z]:[/\\]/.test(rawPath)) return null;
  if (/^[/\\]/.test(decoded) || /^[/\\]/.test(rawPath)) return null;
  const normalized = path.normalize(decoded);
  if (path.isAbsolute(normalized)) return null;
  const normalizedRaw = path.normalize(rawPath);
  if (path.isAbsolute(normalizedRaw)) return null;
  if (normalized.split(/[/\\]/).includes('..')) return null;
  if (normalizedRaw.split(/[/\\]/).includes('..')) return null;
  if (decoded.split(/[/\\]/).includes('..')) return null;
  const targetPath = path.join(tempBase, normalized);
  const rel = path.relative(tempBase, targetPath);
  if (!rel) return null;
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || rel.startsWith('../') || rel.startsWith('..\\')) return null;
  if (path.isAbsolute(rel)) return null;
  return targetPath;
}

export type RejectedReason = { file: string; code: string; message: string };

/** Phase: write files to disk under the workspace, rejecting unsafe paths. */
export async function writeFilesPhase(userId: string, projectId: string, files: SourceFile[]): Promise<{ written: number; rejected: string[]; rejectedReasons: RejectedReason[] }> {
  const rejected: string[] = [];
  const rejectedReasons: RejectedReason[] = [];
  let written = 0;
  // SA4E-300 GAP 1: cross-platform temp base Temp/{userId}/{projectId}/batch-docs/
  const tempBase = resolveIndexTempBase(userId, projectId, 'batch-docs');
  await fs.promises.mkdir(tempBase, { recursive: true });
  for (const file of files) {
    const targetPath = resolveSafeTargetPath(tempBase, file.path);
    if (!targetPath) {
      rejected.push(file.path);
      rejectedReasons.push({ file: file.path, code: 'EACCES', message: 'Unsafe path: must be a relative path staying within the temp directory' });
      continue;
    }
    try {
      await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.promises.writeFile(targetPath, file.content, 'utf-8');
      written++;
    } catch (err: any) {
      rejected.push(file.path);
      rejectedReasons.push({
        file: file.path,
        code: err?.code || 'UNKNOWN',
        message: err?.message || String(err)
      });
    }
  }
  return { written, rejected, rejectedReasons };
}
