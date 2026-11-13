/**
 * SA4E-393 — Source root resolution for design_gate_run.
 * Extracted from design-gate-tool.ts to meet ≤200 lines/file standard.
 */

import * as fs from 'fs';
import * as path from 'path';
import { resolveWorkspacePath } from '../../services/PathResolver';

/** SEC-F01 (C5): generic text — never echo absolute paths / workspace root. */
const OUTSIDE_MSG = 'source_path resolves outside the workspace';

/** Build a generic rejection keeping only the machine-readable CODE prefix. */
function genericReject(rawMessage: string | undefined): { ok: false; message: string } {
  const code = /^([A-Z_]+):/.exec(rawMessage ?? '')?.[1] ?? 'PATH_REJECTED_OUTSIDE_WORKSPACE';
  return { ok: false, message: `${code}: ${OUTSIDE_MSG}` };
}

/** SEC-F02 (C3): true when realpath(target) stays inside realpath(root). */
function isRealPathInside(root: string, target: string): boolean {
  const rel = path.relative(fs.realpathSync(root), fs.realpathSync(target));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Resolve source_root from optional source_path (C3: PathResolver single validation point).
 * @param sourcePath Optional workspace-relative path from tool args.
 * @param workspaceRoot Live workspace root resolved for THIS call — used both as
 *   the default scan root and as the containment root, so one call never mixes roots.
 */
export function resolveSourceRoot(
  sourcePath: string | undefined,
  workspaceRoot: string,
): { ok: true; sourceRoot: string } | { ok: false; message: string } {
  if (!sourcePath) return { ok: true, sourceRoot: workspaceRoot };
  const resolution = resolveWorkspacePath(sourcePath, { rootProvider: () => workspaceRoot });
  if (!resolution.ok) return genericReject(resolution.message);
  try {
    // F-3: nonexistent target → isError with a workspace-RELATIVE path only.
    if (!fs.existsSync(resolution.resolvedPath)) {
      const rel = path.relative(workspaceRoot, resolution.resolvedPath);
      return { ok: false, message: `PATH_NOT_FOUND: source_path does not exist: ${rel}` };
    }
    if (!isRealPathInside(workspaceRoot, resolution.resolvedPath)) {
      return genericReject(undefined);
    }
  } catch {
    return genericReject(undefined); // unresolvable link → fail closed
  }
  return { ok: true, sourceRoot: resolution.resolvedPath };
}
