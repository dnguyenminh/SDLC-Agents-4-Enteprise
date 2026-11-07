/**
 * Input schemas for the built-in local tools (stream_write_file, embed_image).
 * Extracted from backend-local-tools.ts (BR-18 file-size limit).
 * SA4E-394 — every path-accepting local tool documents the optional
 * base_dir/workspace_root (BR-08/BR-22) with description + example (AC5).
 */
import { LocalToolDefinition } from "./registry";
import { FILE_PATH_SCHEMA_DESCRIPTION } from "../services/PathResolver";

const BASE_DIR_SCHEMA = (pathArg: string) => ({
  base_dir: {
    type: "string",
    description:
      `Optional workspace root to resolve relative ${pathArg} against. Must be ` +
      "registered in the server allowlist (MCP_WORKSPACE_ROOTS). Relative values " +
      "are normalized to absolute. Example: /home/user/project-worktree-B",
  },
  workspace_root: {
    type: "string",
    description:
      `Deprecated alias of base_dir (same semantics — optional workspace root to ` +
      `resolve relative ${pathArg} against; must be in the MCP_WORKSPACE_ROOTS ` +
      "allowlist). Ignored when base_dir is present. " +
      "Example: /home/user/project-worktree-B",
  },
});

export function streamWriteFileDefinition(): LocalToolDefinition {
  return {
    name: "stream_write_file",
    description: "Write or append content to a local workspace file (creates parent dirs). Path can be relative to workspace root.",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string", description: FILE_PATH_SCHEMA_DESCRIPTION },
        content: { type: "string", description: "Content to write" },
        mode: { type: "string", enum: ["write", "append"], default: "write" },
        ...BASE_DIR_SCHEMA("file_path"),
      },
      required: ["file_path", "content"],
    },
  };
}

export function embedImageDefinition(): LocalToolDefinition {
  return {
    name: "embed_image",
    description: "Replace local image refs in markdown with base64 data URIs.",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string", description: FILE_PATH_SCHEMA_DESCRIPTION },
        output_path: {
          type: "string",
          description:
            FILE_PATH_SCHEMA_DESCRIPTION +
            " Defaults to <file_path> with '-embedded' inserted before the extension.",
        },
        ...BASE_DIR_SCHEMA("file_path"),
      },
      required: ["file_path"],
    },
  };
}
