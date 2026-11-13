/**
 * SA4E-406 — single source of truth for the base_dir / workspace_root schema
 * properties shared by every extension-side path-taking tool.
 * Replaces 5 hand-written copies that had drifted (some lacked allowlist wording).
 * A7: the admission rule is trust by PARENTS — one configured parent covers
 * every future worktree under it (no per-repo hardcoding).
 */

/**
 * Schema properties for the optional per-call workspace root.
 * @param pathArg - name of the path argument the root applies to (e.g. "file_path")
 */
export const baseDirSchemaProperties = (pathArg: string) => ({
  base_dir: {
    type: 'string',
    description:
      `Optional workspace root (e.g. a git worktree) to resolve a relative ${pathArg} against. ` +
      'Defaults to the session workspace root declared at MCP initialize, else the first folder of the current VS Code window. ' +
      'Admitted when it equals or sits under a trusted parent (VS Code setting "sdlcAgents.workspace.workspaceRootParents", ' +
      'env MCP_WORKSPACE_ROOT_PARENTS), under an open workspace folder, or inside the allowlist: ' +
      'VS Code setting "sdlcAgents.workspace.workspaceRoots", else env MCP_WORKSPACE_ROOTS; ' +
      'otherwise the call is rejected (PATH_REJECTED_OUTSIDE_ALLOWLIST). ' +
      'Relative values are normalized to absolute. Example: /home/user/project-worktree-B',
  },
  workspace_root: {
    type: 'string',
    description:
      `Deprecated alias of base_dir (same semantics and trust rules). Ignored when base_dir ` +
      `is present. Applies to relative ${pathArg}. Example: /home/user/project-worktree-B`,
  },
});
