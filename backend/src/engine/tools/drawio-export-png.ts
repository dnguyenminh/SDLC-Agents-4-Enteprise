/**
 * drawio_export_png — Export .drawio XML (base64) to PNG (base64).
 * Backend receives content_base64, renders PNG, returns output_base64.
 * Priority: 1) draw.io CLI, 2) chrome-devtools-mcp, 3) puppeteer-mcp
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import pino from 'pino';
import { setCachedDrawioCliPath, exportWithCli, exportWithChrome, exportWithPuppeteer, findDrawioCli, hasUpstreamServer } from './drawio-renderers.js';
import { flattenNestedCells } from './drawio-flatten.js';
import {
  hasBaseDirArg,
  type MultiWorktreePathResolver,
} from '../../shared/multi-worktree-path-resolver.js';
import { getSharedPathResolver } from '../../shared/path-resolver-provider.js';
import { baseDirSchemaProperties } from '../../shared/base-dir-schema.js';

const logger = pino({ name: 'drawio-export-png' });

export const DRAWIO_EXPORT_PNG_DEFINITION = {
  name: 'drawio_export_png',
  description: 'Export .drawio XML content (base64) to PNG. Returns output_base64 (PNG bytes).',
  inputSchema: {
    type: 'object',
    properties: {
      content_base64: { type: 'string', description: 'Base64-encoded .drawio XML content' },
      file_path: { type: 'string', description: 'Original file path (reference only)' },
      ...baseDirSchemaProperties('file_path'),
    },
    required: ['content_base64'],
  },
};

type RendererType = 'drawio-cli' | 'chrome-devtools-mcp' | 'puppeteer-mcp' | 'none';

let cachedRenderer: RendererType | null = null;

export function detectRenderer(orchestrationEngine?: any): RendererType {
  if (cachedRenderer !== null) return cachedRenderer;
  const cliPath = findDrawioCli();
  if (cliPath) { setCachedDrawioCliPath(cliPath); cachedRenderer = 'drawio-cli'; return cachedRenderer; }
  if (orchestrationEngine && hasUpstreamServer(orchestrationEngine, 'chrome-devtools-mcp')) {
    cachedRenderer = 'chrome-devtools-mcp'; return cachedRenderer;
  }
  if (orchestrationEngine && hasUpstreamServer(orchestrationEngine, 'puppeteer')) {
    cachedRenderer = 'puppeteer-mcp'; return cachedRenderer;
  }
  cachedRenderer = 'none';
  return cachedRenderer;
}

export function isExportPngAvailable(orchestrationEngine?: any): boolean {
  return detectRenderer(orchestrationEngine) !== 'none';
}

export function resetRendererCache(): void {
  cachedRenderer = null;
  setCachedDrawioCliPath(null);
}

export async function handleDrawioExportPng(
  args: Record<string, unknown>,
  workspace: string,
  orchestrationEngine?: any,
  resolver?: MultiWorktreePathResolver,
): Promise<string> {
  const b64 = args.content_base64 as string | undefined;
  if (!b64) return jsonError('content_base64 is required');

  // SA4E-394 (DISC-4): backend file_path is reference-only — the render writes
  // to a temp dir and returns output_base64. When base_dir is supplied the
  // reference is still validated through the shared resolver (containment
  // enforced); the output_path write-back belongs to the extension proxy.
  if (hasBaseDirArg(args) && typeof args.file_path === 'string' && args.file_path.trim() !== '') {
    const result = (resolver ?? getSharedPathResolver(logger)).resolve({
      filePath: args.file_path, baseDir: args.base_dir, workspaceRoot: args.workspace_root,
    });
    if (!result.ok) return jsonError(result.message);
  }

  const content = decodeBase64Content(b64);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'drawio-'));
  const tmpDrawio = path.join(tmpDir, 'input.drawio');
  const tmpPng = path.join(tmpDir, 'input.png');

  try {
    const xml = normalizeForCli(content);
    fs.writeFileSync(tmpDrawio, xml, 'utf-8');
    const renderer = detectRenderer(orchestrationEngine);
    await renderWithEngine(renderer, tmpDrawio, tmpPng, workspace, orchestrationEngine);
    if (!fs.existsSync(tmpPng)) return jsonError('Export failed — PNG not created');
    const pngBuf = fs.readFileSync(tmpPng);
    const outputBase64 = pngBuf.toString('base64');
    return JSON.stringify({ success: true, output_base64: outputBase64, size_bytes: pngBuf.length, renderer });
  } catch (e: any) {
    return jsonError(`Export failed: ${e.message ?? e}`);
  } finally {
    cleanupTmpDir(tmpDir);
  }
}

function decodeBase64Content(b64: string): string {
  return Buffer.from(b64, 'base64').toString('utf-8');
}

/**
 * SA4E-410 — full normalisation pipeline applied before the draw.io CLI runs.
 *
 * 1. `escapeAttributeValues` — raw `<` / `&` inside attribute values make the
 *    document not well-formed AND corrupt flatten's tag scanning (DISC-3b).
 * 2. `flattenNestedCells`  — nested `<mxCell>` elements crash the CLI.
 * 3. `wrapXmlIfNeeded`      — the CLI only consumes a `<mxfile>` document.
 */
export function normalizeForCli(content: string): string {
  // SA4E-410 (DISC-3b): escape runs FIRST. Raw `<` / `>` inside attribute
  // values would corrupt flatten's own tag scanning (its regexes stop at the
  // first `>` incl. ones inside quoted values) — with escaped entities the
  // scanner sees clean tags, and escape is idempotent so re-escaping below
  // (escapeAttr in flatten, escapeAttributeValues in wrapXmlIfNeeded) is a
  // no-op.
  return wrapXmlIfNeeded(flattenNestedCells(escapeAttributeValues(content)));
}

/**
 * SA4E-410 (DISC-2): hand-authored diagrams frequently contain raw `<` and `&`
 * inside attribute values (e.g. `value="Map<string, Tab>"`, `value="A & B"`).
 * That is NOT well-formed XML — a strict parser rejects the whole document and
 * draw.io CLI then aborts with "Export failed".
 *
 * Escape only inside quoted attribute values; already-valid entities are left
 * alone so the function is idempotent.
 */
export function escapeAttributeValues(xml: string): string {
  const AMP = '&' + 'amp;';
  const LT = '&' + 'lt;';
  const GT = '&' + 'gt;';
  return xml.replace(/="([^"]*)"/g, (_match, value: string) => {
    const escaped = value
      .replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, AMP)
      .replace(/</g, LT)
      .replace(/>/g, GT);
    return `="${escaped}"`;
  });
}

/**
 * SA4E-410 (DISC-1): draw.io CLI can only consume a *file* — `<mxfile>` with a
 * `<diagram>` child. A bare `<mxGraphModel>` is only the model fragment; the
 * CLI fails on it for any non-trivial diagram (nested cells, escaped chars)
 * and reports "Export failed" while writing NO png at all.
 *
 * The previous implementation returned bare `<mxGraphModel>` content
 * unchanged, so every hand-authored diagram whose root was `<mxGraphModel>`
 * silently failed to export.
 */
export function wrapXmlIfNeeded(content: string): string {
  // SA4E-410: strip the declaration FIRST — the wrapper emits its own, and a
  // document that already carries `<?xml …?>\n<mxfile …>` must be recognised
  // as wrapped and never wrapped a second time.
  const trimmed = content.trim().replace(/^<\?xml[^>]*\?>\s*/i, '');
  if (trimmed.startsWith('<mxfile')) {
    // An <mxfile> passes through, but the declaration (if any) was stripped —
    // re-emit it so the result is stable under repeated normalisation.
    return `<?xml version="1.0" encoding="UTF-8"?>\n${escapeAttributeValues(trimmed)}`;
  }

  // Wrap as a single-page draw.io FILE. A bare <mxGraphModel> is only the
  // model fragment and draw.io CLI refuses to render it.
  const body = escapeAttributeValues(trimmed);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<mxfile host="app.diagrams.net" agent="drawio" version="24.7.17" type="device">\n  <diagram id="sa4e-page-1" name="Page-1">\n${body}\n  </diagram>\n</mxfile>`;
}

async function renderWithEngine(
  renderer: RendererType, inputPath: string, outputPath: string,
  workspace: string, orchestrationEngine?: any
): Promise<void> {
  switch (renderer) {
    case 'drawio-cli': await exportWithCli(inputPath, outputPath); break;
    case 'chrome-devtools-mcp': await exportWithChrome(inputPath, outputPath, workspace, orchestrationEngine); break;
    case 'puppeteer-mcp': await exportWithPuppeteer(inputPath, outputPath, workspace, orchestrationEngine); break;
    default: throw new Error('No renderer available. Install draw.io desktop or configure chrome-devtools-mcp.');
  }
}

function cleanupTmpDir(dir: string): void {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (err) { logger.debug({ err }, '[drawio-export-png] best-effort '); }
}

function jsonError(msg: string): string {
  return JSON.stringify({ success: false, error: msg });
}
