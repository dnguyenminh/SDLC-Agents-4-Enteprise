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

import * as os from 'os';
import * as path from 'path';
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

/**
 * Artifact output roots — the dedicated sinks for orphaned artifact files
 * (SA4E-380 F-01/F-05). Shared single source for OI-14 (immediate cleanup +
 * read confinement) and OI-15 (periodic sweep). The raw OS temp root and the
 * agent workspace are NEVER roots.
 *
 * Resolution order:
 *  1. `ARTIFACT_OUTPUT_ROOTS` env override — `path.delimiter`-separated list
 *     (operator trust; see SA-08 for the recommended defense-in-depth checks).
 *  2. Defaults: the dedicated `%TEMP%/sa4e-artifacts` sink, the workspace
 *     `tmp/artifacts` directory, and the markdown-exporter child's own
 *     artifact home (F-01: without it every local-path read fails confinement).
 */
export function artifactOutputRoots(env: NodeJS.ProcessEnv = process.env): readonly string[] {
  const override = parseArtifactRootsEnv(env.ARTIFACT_OUTPUT_ROOTS);
  if (override) return override;
  const workspace = path.resolve(process.cwd());
  const childHome =
    process.platform === 'win32'
      ? path.join(process.env.LOCALAPPDATA ?? '', 'markdown-exporter-mcp', 'artifacts')
      : path.join(process.env.HOME ?? os.homedir(), '.cache', 'markdown-exporter-mcp', 'artifacts');
  return [
    path.join(os.tmpdir(), 'sa4e-artifacts'),
    path.join(workspace, 'tmp', 'artifacts'),
    path.resolve(childHome),
  ];
}

/** SA-08 surface: parse the env override; empty/garbage → fall back to defaults. */
function parseArtifactRootsEnv(raw: string | undefined): readonly string[] | undefined {
  if (!raw) return undefined;
  const roots = raw.split(path.delimiter).map((s) => s.trim()).filter(Boolean);
  return roots.length ? roots : undefined;
}

/**
 * F-01 containment: is `candidate` (already realpath-canonicalised by the
 * caller) located inside `root`? Compares with `path.relative` — case-folded
 * on win32, cross-device resolves to an absolute path → rejected. Separator
 * boundary is honoured (`<root>-evil` is NOT inside `<root>`).
 */
export function isPathWithinRoot(root: string, candidate: string): boolean {
  const rel = path.relative(path.resolve(root), path.resolve(candidate));
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

/** Per-tool escape hatch for tools that defy the naming/description convention. */
export const CONTENT_PROXY_OVERRIDES: Record<string, ContentProxyOverride> = {};
