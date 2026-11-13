/**
 * Input schemas for the built-in local tools (stream_write_file, embed_image).
 * Extracted from backend-local-tools.ts (BR-18 file-size limit).
 * SA4E-394 — every path-accepting local tool documents the optional
 * base_dir/workspace_root (BR-08/BR-22) with description + example (AC5).
 */
import { LocalToolDefinition } from "./registry";
import { FILE_PATH_SCHEMA_DESCRIPTION } from "../services/PathResolver";
import { baseDirSchemaProperties } from "../services/tool-descriptions";


export function streamWriteFileDefinition(): LocalToolDefinition {
  return {
    name: "stream_write_file",
    description: "Write (overwrite) or append text content to a file in the local workspace, creating missing parent directories. Use for large documents instead of passing them through other tools. Relative file_path resolves against the workspace root (or base_dir); paths outside the root/allowlist are rejected.",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string", description: FILE_PATH_SCHEMA_DESCRIPTION },
        content: { type: "string", description: "Full text content to write or append (UTF-8)." },
        mode: { type: "string", enum: ["write", "append"], default: "write", description: "\"write\" replaces the file; \"append\" adds to the end (file is created if missing)." },
        ...baseDirSchemaProperties("file_path"),
      },
      required: ["file_path", "content"],
    },
  };
}

export function embedImageDefinition(): LocalToolDefinition {
  return {
    name: "embed_image",
    description: "Read a markdown file from the local workspace, replace every local image reference (![alt](relative/path.png)) with an inline base64 data URI, and write the result to output_path. Remote (http/https) and already-embedded images are left unchanged. The source file is not modified.",
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
        ...baseDirSchemaProperties("file_path"),
      },
      required: ["file_path"],
    },
  };
}
