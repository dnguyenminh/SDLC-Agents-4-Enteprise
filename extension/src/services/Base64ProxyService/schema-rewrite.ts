/**
 * Tool schema detection + LLM visibility rewriting (Base64ProxyService).
 * Hides content_base64 from the LLM and exposes file_path/output_path instead.
 *
 * Works for both schema shapes the backend emits:
 *  - tools/list → `inputSchema`
 *  - find_tools catalog → `schema`
 */

import { FILE_PATH_SCHEMA_DESCRIPTION } from "../PathResolver";
import type { ToolSchema } from "./types";

/** The schema field a tool carries: `inputSchema` (tools/list) or `schema` (catalog). */
export function toolSchemaField(tool: ToolSchema): "inputSchema" | "schema" | null {
  if (tool.inputSchema) return "inputSchema";
  if (tool.schema) return "schema";
  return null;
}

/** Check if a tool schema declares a content_base64 input param. */
export function hasBase64InputParam(tool: ToolSchema): boolean {
  const field = toolSchemaField(tool);
  if (!field) return false;
  const props = (tool[field] as any)?.properties as Record<string, any> | undefined;
  if (!props) return false;
  return "content_base64" in props;
}

/** Check if a tool advertises base64 output (description marker or x-output-base64). */
export function hasBase64Output(tool: ToolSchema): boolean {
  const desc = tool.description || "";
  if (desc.includes("output_base64")) return true;
  const field = toolSchemaField(tool);
  return field ? (tool[field] as any)?.["x-output-base64"] === true : false;
}

/** Rewrite a single tool schema for LLM visibility (hide content params, add file_path/output_path). */
export function rewriteSingleSchema(tool: ToolSchema, isInput: boolean, isOutput: boolean): ToolSchema {
  if (!isInput && !isOutput) return tool;
  const field = toolSchemaField(tool);
  if (!field) return tool;

  const schema = { ...(tool[field] as Record<string, any>) };
  const props = { ...(schema.properties as Record<string, any> || {}) };
  const required = [...(schema.required as string[] || [])];

  if (isInput) {
    delete props.content_base64;
    // Backend-declared content arg (e.g. export_docx → markdown): the wrapper
    // supplies it from file_path, so it must disappear from the LLM schema.
    const contentParam = schema["x-content-param"];
    if (typeof contentParam === "string") {
      delete props[contentParam];
      const contentIdx = required.indexOf(contentParam);
      if (contentIdx >= 0) required.splice(contentIdx, 1);
    }
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
  return { ...tool, [field]: schema };
}
