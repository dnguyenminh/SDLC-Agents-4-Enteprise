/**
 * SA4E-417 — Patch Protocol (16K Doc §12).
 *
 * Structured patch with base-hash optimistic concurrency:
 *   1. patch size limit            → PATCH_TOO_LARGE
 *   2. path validity (relative)    → PATH_INVALID
 *   3. symlink/containment escape  → SYMLINK_ESCAPE_FORBIDDEN
 *   4. workspace ownership         → WORKSPACE_MISMATCH
 *   5. base hash unchanged         → STALE_BASE (reject; rebase is explicit)
 *   6. apply diff in memory        → expected_new_hash mismatch aborts the
 *      write (atomic: file replaced only when the result hash matches)
 *
 * File IO is injected (PatchIo) so tests run on an in-memory workspace and the
 * real runner supplies tmp-write+rename atomicity.
 */

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import pino from 'pino';
import { resolveWorkspacePath } from './sandbox.js';

const logger = pino({ name: 'patch-protocol' });

export const MAX_PATCH_BYTES = 512 * 1024;
/** Base hash of a non-existent file — marks a CREATION patch. */
export const EMPTY_HASH = sha256Hex('');

export interface StructuredPatch {
  workspaceId: string;
  baseRevision: string;
  filePath: string;
  originalContentHash: string;
  diff: string;
  expectedNewHash: string;
}

export type PatchRejection =
  | 'PATCH_TOO_LARGE'
  | 'PATH_INVALID'
  | 'SYMLINK_ESCAPE_FORBIDDEN'
  | 'WORKSPACE_MISMATCH'
  | 'STALE_BASE'
  | 'EXPECTED_HASH_MISMATCH'
  | 'FILE_NOT_FOUND';

export interface PatchApplyResult {
  applied: boolean;
  rejected?: PatchRejection;
  detail?: string;
  newHash?: string;
}

export interface PatchIo {
  workspaceId: string;
  workspaceRoot: string;
  fileExists(absolutePath: string): Promise<boolean>;
  readContent(absolutePath: string): Promise<string>;
  sha256(content: string): string;
  /** Apply the unified diff to original content (in memory). */
  applyDiff(original: string, diff: string): string;
  /** Atomic write — tmp file + rename in the real implementation. */
  writeContent(absolutePath: string, content: string): Promise<void>;
}

export function sha256Hex(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export class PatchProtocol {
  constructor(private readonly io: PatchIo) {}

  async validateAndApply(patch: StructuredPatch): Promise<PatchApplyResult> {
    // 1. size limit
    if (Buffer.byteLength(patch.diff, 'utf8') > MAX_PATCH_BYTES) {
      return { applied: false, rejected: 'PATCH_TOO_LARGE', detail: `diff > ${MAX_PATCH_BYTES} bytes` };
    }
    // 2. path validity (relative, no '..')
    const rel = patch.filePath.replaceAll('\\', '/');
    if (/^[a-zA-Z]:[\\/]/.test(rel) || rel.startsWith('/') || rel.split('/').includes('..') || rel.trim() === '') {
      return { applied: false, rejected: 'PATH_INVALID', detail: rel };
    }
    // 3. target resolution: existing files go through the full symlink guard;
    //    missing files are CREATION patches — the parent dir must be contained.
    let absolute: string;
    const directAbs = path.join(this.io.workspaceRoot, rel);
    if (fs.existsSync(directAbs)) {
      try {
        absolute = resolveWorkspacePath(this.io.workspaceRoot, rel);
      } catch (err) {
        return { applied: false, rejected: 'SYMLINK_ESCAPE_FORBIDDEN', detail: String((err as Error)?.message ?? err) };
      }
    } else {
      try {
        const parentReal = resolveWorkspacePath(this.io.workspaceRoot, path.posix.dirname(rel));
        absolute = path.join(parentReal, path.basename(rel));
      } catch (err) {
        return { applied: false, rejected: 'SYMLINK_ESCAPE_FORBIDDEN', detail: String((err as Error)?.message ?? err) };
      }
    }
    // 4. workspace ownership
    if (this.io.workspaceId !== patch.workspaceId) {
      return { applied: false, rejected: 'WORKSPACE_MISMATCH', detail: `${this.io.workspaceId} != ${patch.workspaceId}` };
    }
    // 5. base hash unchanged (stale-base rejection); empty base = creation
    const isCreation = !(await this.io.fileExists(absolute));
    if (isCreation && patch.originalContentHash !== EMPTY_HASH) {
      return { applied: false, rejected: 'FILE_NOT_FOUND', detail: `${rel} — claimed a non-empty base that does not exist` };
    }
    const currentContent = isCreation ? '' : await this.io.readContent(absolute);
    const currentHash = this.io.sha256(currentContent);
    if (currentHash !== patch.originalContentHash) {
      return {
        applied: false,
        rejected: 'STALE_BASE',
        detail: `expected ${patch.originalContentHash.slice(0, 12)}…, actual ${currentHash.slice(0, 12)}… — rebase required`,
      };
    }
    // 6. apply in memory + verify expected result hash BEFORE writing (atomic)
    const newContent = this.io.applyDiff(currentContent, patch.diff);
    const newHash = this.io.sha256(newContent);
    if (newHash !== patch.expectedNewHash) {
      return {
        applied: false,
        rejected: 'EXPECTED_HASH_MISMATCH',
        detail: `computed ${newHash.slice(0, 12)}…, expected ${patch.expectedNewHash.slice(0, 12)}…`,
      };
    }
    await this.io.writeContent(absolute, newContent);
    logger.info({ file: rel, newHash: newHash.slice(0, 12) }, '[patch-protocol] applied atomically');
    return { applied: true, newHash };
  }
}
