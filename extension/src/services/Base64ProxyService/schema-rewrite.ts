/**
 * Tool schema detection + LLM visibility rewriting (Base64ProxyService).
 * Hides content_base64 from the LLM and exposes file_path/output_path instead.
 */

import { FILE_PATH_SCHEMA_DESCRIPTION } from "../PathResolver";
import type { ToolSchema } from "./types";

/** Check if a tool schema declares a content_base64 input param. */
export function hasBase64InputParam(tool: ToolSchema): boolean {
  const schema = tool.inputSchema;
  if (!schema) return false;
  const props = schema.properties as Record<string, any> | undefined;
  if (!props) return false;
  return "content_base64" in props;
}

/** Check if a tool description advertises output_base64 in its response. */
export function hasBase64Output(tool: ToolSchema): boolean {
  const desc = tool.description || "";
  return desc.includes("output_base64") || desc.includes("Returns output_base64");
}

/** Rewrite a single tool schema for LLM visibility (hide content_base64, add output_path). */
export function rewriteSingleSchema(tool: ToolSchema, isInput: boolean, isOutput: boolean): ToolSchema {
  if (!isInput && !isOutput) return tool;
  const rewritten = { ...tool, inputSchema: { ...tool.inputSchema } };
  const schema = rewritten.inputSchema!;
  const props = { ...(schema.properties as Record<string, any> || {}) };
  const required = [...(schema.required as string[] || [])];
  if (isInput) {
    delete props.content_base64;
    // M-1: file_path description is ALWAYS overwritten with the shared rule
    // (closes the mem_ingest_file no-description + drawio_export_png
    // "reference only" holes — FSD §3.2.2).
    props.file_path = { type: "string", description: FILE_PATH_SCHEMA_DESCRIPTION };
    if (!required.includes("file_path")) required.push("file_path");
    const idx = required.indexOf("content_base64");
    if (idx >= 0) required.splice(idx, 1);
  }
  if (isOutput && !props.output_path) {
    // M-2: suffix covers BOTH resolveOutputPath derived branches
    // (.drawio→.png swap; non-.drawio gets .out appended — DISC-2).
    props.output_path = {
      type: "string",
      description:
        FILE_PATH_SCHEMA_DESCRIPTION +
        " Defaults to <file_path> with extension swapped (.drawio→.png; non-.drawio inputs get .out appended).",
    };
  }
  schema.properties = props;
  schema.required = required;
  return rewritten;
}
