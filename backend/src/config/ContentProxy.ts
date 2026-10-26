/**
 * Content Proxy configuration — how the backend exposes child tools to the
 * extension's file↔base64 wrapper without adding new tools.
 *
 * Convention (auto-detected, no per-tool code):
 *  - Tools named `export_*`, `render_*`, `generate_*` (or whose description says
 *    "… to PDF/DOCX/HTML/…") are file producers → their result artifacts are
 *    inlined as `output_base64` when invoked through the wrapper.
 *  - Within those tools the content argument is the first alias present
 *    (`markdown`, `content`, `html`, …) or the single required string argument.
 *
 * Overrides exist only for tools that do not follow the convention.
 */

import * as fs from 'fs';
/** Tool-name prefixes whose result is a file written by the child server. */
export const FILE_TOOL_NAME_PREFIXES: readonly string[] = ['export_', 'render_', 'generate_'];

/** Description fallback: "Convert ... to PDF/DOCX/…" (target must be a file format). */
export const FILE_OUTPUT_DESCRIPTION = /\bto\s+(pdf|docx|html|pptx|xlsx|json|png|jpe?g|gif|svg|zip)\b/i;

/** Argument names that carry document content, in priority order. */
export const CONTENT_PARAM_ALIASES: readonly string[] = [
  'markdown',
  'markdown_content',
  'content',
  'html',
  'xml',
  'text',
  'body',
  'source',
  'template',
];

/** Argument names that are never document content (paths, ids, metadata). */
export const NON_CONTENT_PARAM =
  /^(content_base64|.*_base64|file_path|.*_path|path|url|uri|dir|.*_id|id|name|.*_name|key|.*_key|token|secret|password|mime|.*_type|type|format|mode|encoding)$/i;

/** Maximum artifact size inlined as base64 (mirrors the extension pre-read cap). */
export const MAX_ARTIFACT_BYTES = 25 * 1024 * 1024;

/** Per-tool escape hatch for tools that defy the naming/description convention. */
export interface ContentProxyOverride {
  /** Force the content argument (null = the tool has no content argument). */
  contentParam?: string | null;
  /** Force artifact inlining on/off. */
  fileOutput?: boolean;
  /** Disable the adapter entirely for this tool. */
  enabled?: boolean;
}

/** Artifact output roots — dedicated sinks for orphaned artifact files. */
export function artifactOutputRoots(): readonly string[] {
  // Convention: ARTIFACT_OUTPUT_ROOTS env var, or default per-workspace roots
  const env = process.env.ARTIFACT_OUTPUT_ROOTS;
  if (env) return env.split(':').map((s) => s.trim()).filter(Boolean);
  // Default: no roots configured → sweep will find nothing (safe no-op)
  return [];
}

/** Check whether a real path falls inside one of the artifact roots. */
export function isPathWithinRoot(root: string, candidate: string): boolean {
  try {
    const real = fs.realpathSync(candidate);
    return artifactOutputRoots().some((r) => real.startsWith(r));
  } catch {
    return false;
  }
}

/** Per-tool escape hatch for tools that defy the naming/description convention. */
export const CONTENT_PROXY_OVERRIDES: Record<string, ContentProxyOverride> = {};
