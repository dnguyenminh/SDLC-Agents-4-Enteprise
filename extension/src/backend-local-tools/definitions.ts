/**
 * Input schemas for the built-in local tools (stream_write_file, embed_image).
 * Extracted from backend-local-tools.ts (BR-18 file-size limit).
 */
import { LocalToolDefinition } from "./registry";
import { FILE_PATH_SCHEMA_DESCRIPTION } from "../services/PathResolver";

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
      },
      required: ["file_path"],
    },
  };
}
