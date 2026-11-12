/**
 * SA4E-393 — Source root resolution for design_gate_run.
 * Extracted from design-gate-tool.ts to meet ≤200 lines/file standard.
 */

import { EnvConfig } from '../../slash/types';
import { resolveWorkspacePath } from '../../services/PathResolver';

/** Resolve source_root from optional source_path (C3: PathResolver single validation point). */
export function resolveSourceRoot(sourcePath: string | undefined): { ok: true; sourceRoot: string } | { ok: false; message: string } {
  if (!sourcePath) {
    const root = process.env[EnvConfig.WORKSPACE_ROOT];
    if (!root) return { ok: false, message: 'No workspace folder open. Open a project folder first.' };
    return { ok: true, sourceRoot: root };
  }
  const resolution = resolveWorkspacePath(sourcePath);
  if (!resolution.ok) {
    return { ok: false, message: resolution.message };
  }
  return { ok: true, sourceRoot: resolution.resolvedPath };
}