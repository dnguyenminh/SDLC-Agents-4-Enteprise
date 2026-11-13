/**
 * SA4E-393 Addendum 5 — single source of client-visible rejection text (TDD E6).
 * The detail echoes ONLY the sanitized base_dir the caller sent: never the admin
 * dir, repo root, allowlist content or the reason token (BR-WT10, SEC-WT-10).
 */
import type { WorktreeReason } from './types';

export type ReasonGroup = 'legacy' | 'generic' | 'parent';

const LEGACY_REASONS: ReadonlySet<WorktreeReason> = new Set(['disabled', 'not_a_worktree', 'unc_unsupported']);
const PARENT_REASONS: ReadonlySet<WorktreeReason> = new Set(['parent_not_trusted', 'bare_not_registered']);

const NOT_VERIFIED = ' It is not a verified git worktree of a trusted repository.';
const GENERIC_HINT = ' Alternatively, use a git worktree of the open workspace repository.';
const PARENT_HINT = ' The parent repository must be in MCP_WORKSPACE_ROOTS or be the open workspace folder.';

/** Which message variant a reason maps to (parent vs generic is a documented, accepted oracle). */
export function reasonGroup(reason: WorktreeReason): ReasonGroup {
  if (LEGACY_REASONS.has(reason)) return 'legacy';
  return PARENT_REASONS.has(reason) ? 'parent' : 'generic';
}

/** Anti log-forging: same replacement the backend uses in sanitizePathText (kept in sync by hand; the extension is the source of truth). */
function clean(value: string): string {
  return String(value ?? '').replace(/[\r\n\0]/g, '?');
}

/** Detail text (without the `CODE: ` prefix; callers add it). Legacy group is byte-identical to the pre-feature message. */
export function buildRejectionDetail(baseDir: string, reason: WorktreeReason): string {
  const legacy = `Workspace root '${clean(baseDir)}' is not registered in the allowlist. ` +
    'Configure MCP_WORKSPACE_ROOTS to include this path.';
  switch (reasonGroup(reason)) {
    case 'legacy': return legacy;
    case 'parent': return legacy + NOT_VERIFIED + PARENT_HINT;
    default: return legacy + NOT_VERIFIED + GENERIC_HINT;
  }
}
