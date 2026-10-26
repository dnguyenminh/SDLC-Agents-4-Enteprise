/**
 * Artifact root helpers shared by OI-14 (immediate cleanup, content proxy) and
 * OI-15 (periodic sweep). SECURITY-REVIEW F-01/F-05: local artifact access is
 * confined to the dedicated ARTIFACT_OUTPUT_ROOTS — a path whose real location
 * (symlinks resolved) falls outside them is never read and never deleted.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  FILE_TOOL_NAME_PREFIXES,
  artifactOutputRoots,
  isPathWithinRoot,
} from '../../../config/ContentProxy.js';

/**
 * F-01 — true only when the candidate's real path (fs.realpathSync, so symlink
 * and `..` tricks are resolved away) sits inside one of the artifact roots.
 * A missing path (ENOENT) or unreadable chain is not within the roots.
 */
export function isWithinArtifactRoots(
  candidate: string,
  roots: readonly string[] = artifactOutputRoots(),
): boolean {
  let real: string;
  try {
    real = fs.realpathSync(candidate);
  } catch {
    return false;
  }
  return roots.some((root) => isPathWithinRoot(resolveRoot(root), real));
}

/** OI-15 — artifact file-name pattern: `export_*`, `render_*`, `generate_*`. */
export function isArtifactFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return FILE_TOOL_NAME_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

function resolveRoot(root: string): string {
  try {
    return fs.realpathSync(root);
  } catch {
    return path.resolve(root);
  }
}
