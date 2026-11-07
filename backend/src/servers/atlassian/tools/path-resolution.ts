/**
 * SA4E-394 — shared path resolution for the Atlassian attachment tools.
 * Replaces the second, divergent containment implementation
 * (`ALLOWED_BASES = [process.cwd()]` + per-tool validateFilePath) with the
 * shared multi-worktree resolver (TDD §6.4 — one containment implementation).
 * Uploads read the file ONLY after the resolver returns ok (BR-07).
 */

import pino from 'pino';
import { realpath } from 'node:fs/promises';
import { getSharedPathResolver } from '../../../shared/path-resolver-provider.js';
import { hasBaseDirArg } from '../../../shared/multi-worktree-path-resolver.js';

const logger = pino({ name: 'atlassian-path-resolution' });

export interface AttachmentPathArgs {
  file_path: string;
  base_dir?: string;
  workspace_root?: string;
}

export type AttachmentPathResult =
  | { ok: true; resolved: string; usedBaseDir: boolean }
  | { ok: false; code: string; message: string };

/** Resolve + contain the attachment source path via the shared resolver. */
export function resolveAttachmentPath(args: AttachmentPathArgs): AttachmentPathResult {
  const usedBaseDir = hasBaseDirArg(args as unknown as Record<string, unknown>);
  const result = getSharedPathResolver(logger).resolve({
    filePath: args.file_path,
    baseDir: args.base_dir,
    workspaceRoot: args.workspace_root,
  });
  if (result.ok) return { ok: true, resolved: result.resolvedPath, usedBaseDir };
  logger.warn(
    { tool_name: 'atlassian_attachment', base_dir: args.base_dir, code: result.code },
    'attachment path rejected by multi-worktree resolver',
  );
  return { ok: false, code: result.code, message: result.message };
}

/**
 * Finalize the resolved path via realpath — preserves the legacy "File not
 * found or inaccessible" contract and resolves any remaining symlink before
 * the upload read.
 */
export async function finalizeAttachmentPath(resolved: string): Promise<string | null> {
  try {
    return await realpath(resolved);
  } catch {
    return null;
  }
}
