/**
 * SA4E-394 — Shared base_dir / workspace_root schema fragment (BR-08, BR-22).
 * Identical documentation on every affected tool (BR-20). Neither property is
 * `required` (backward compatible, BR-03); validation happens in the resolver,
 * NOT via JSON-schema `pattern` (paths are platform-dependent — schema stays
 * permissive, TDD §3.2 / TC-301).
 */

const BASE_DIR_DESCRIPTION = (pathArg: string): string =>
  `Optional workspace root to resolve relative ${pathArg} against. ` +
  'Must be registered in the server allowlist (MCP_WORKSPACE_ROOTS env var or ' +
  'MCP_WORKSPACE_ROOTS_FILE). Relative values are normalized to absolute. ' +
  'Example: /home/user/project-worktree-B';

const ALIAS_DESCRIPTION = (pathArg: string): string =>
  `Deprecated alias of base_dir (same semantics — optional workspace root to ` +
  `resolve relative ${pathArg} against; must be in the MCP_WORKSPACE_ROOTS ` +
  'allowlist). Ignored when base_dir is present. ' +
  'Example: /home/user/project-worktree-B';

/** Schema properties fragment — spread into a tool's inputSchema.properties. */
export function baseDirSchemaProperties(pathArg: string): Record<string, unknown> {
  return {
    base_dir: { type: 'string', description: BASE_DIR_DESCRIPTION(pathArg) },
    workspace_root: { type: 'string', description: ALIAS_DESCRIPTION(pathArg) },
  };
}
