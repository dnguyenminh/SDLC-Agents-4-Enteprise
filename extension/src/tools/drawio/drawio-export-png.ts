/**
 * drawio_export_png — Export .drawio XML (base64) to PNG (base64).
 * SA4E-406 Extension Migration: runs LOCALLY in the extension process.
 * Priority: 1) draw.io CLI, 2) chrome-devtools-mcp, 3) puppeteer-mcp
 * (upstream-MCP renderers activate when wired by the caller; CLI is the
 * default self-contained path).
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { setCachedDrawioCliPath, exportWithCli, findDrawioCli, hasUpstreamServer } from './drawio-renderers';
import { sanitizeLogText, resolveWorkspacePath, FILE_PATH_SCHEMA_DESCRIPTION } from '../../services/PathResolver';
import { extractBaseDirArg } from '../../services/base-dir-resolution';
import { baseDirSchemaProperties } from '../../services/tool-descriptions';
import type { ToolCallContext } from '../../backend-local-tools/registry';

export const DRAWIO_EXPORT_PNG_DEFINITION = {
  name: 'drawio_export_png',
  description:
    'Render a .drawio diagram to a PNG image using the local draw.io desktop CLI (fallback: chrome-devtools-mcp / ' +
    'puppeteer-mcp). Runs locally in the extension. Callers pass file_path (the .drawio file); the extension reads ' +
    'it, renders, and writes the PNG to output_path (default: file_path with .drawio replaced by .png). ' +
    'Does not modify the .drawio source. Returns JSON {success, file_path (the PNG written), size_bytes, renderer}; ' +
    'fails with isError if no renderer is installed or the XML is invalid. ' +
    'Tip: run drawio_auto_layout first, then export, then visually check the PNG. ' +
    'Raw interface (no proxy): content_base64 in, output_base64 out.',
  inputSchema: {
    type: 'object',
    properties: {
      content_base64: { type: 'string', description: 'Base64-encoded .drawio XML content (raw interface; the proxy replaces it with file_path)' },
      file_path: {
        type: 'string',
        description:
          'Path of the .drawio file to render. ' + FILE_PATH_SCHEMA_DESCRIPTION +
          ' When content_base64 is provided this is reference only.',
      },
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

/** Local tool handler — args in, MCP tool-result shape out. */
export async function handleDrawioExportPng(
  args: Record<string, unknown>,
  ctx?: ToolCallContext,
): Promise<unknown> {
  const b64 = args.content_base64 as string | undefined;
  if (!b64) return toolText(jsonError('content_base64 is required'), true);

  // SA4E-394 (DISC-4): file_path is reference-only — the render writes to a
  // temp dir and returns output_base64. When base_dir/file_path is supplied it
  // is still validated through the PathResolver (containment enforced); the
  // output_path write-back belongs to the caller (Base64ProxyService).
  // F4: forward the bound session root so session-bound clients resolve
  // against their session root.
  if (typeof args.file_path === 'string' && args.file_path.trim() !== '') {
    const resolution = resolveWorkspacePath(args.file_path, { baseDir: extractBaseDirArg(args), sessionRoot: ctx?.sessionRoot });
    if (!resolution.ok) {
      console.warn(`[drawio-export-png] reference path rejected: ${sanitizeLogText(resolution.message)}`);
      return toolText(jsonError(resolution.message), true);
    }
  }

  const content = decodeBase64Content(b64);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'drawio-'));
  const tmpDrawio = path.join(tmpDir, 'input.drawio');
  const tmpPng = path.join(tmpDir, 'input.png');

  try {
    const xml = wrapXmlIfNeeded(content);
    fs.writeFileSync(tmpDrawio, xml, 'utf-8');
    // F5: local handler — no orchestrationEngine is threaded through
    // executeLocalTool; CLI is the self-contained path. Upstream renderers
    // (chrome-devtools/puppeteer) are not available here; falling back to CLI
    // / a clean "No renderer available" error is acceptable, crashing is not.
    const renderer = detectRenderer();
    await renderWithEngine(renderer, tmpDrawio, tmpPng);
    if (!fs.existsSync(tmpPng)) return toolText(jsonError('Export failed — PNG not created'), true);
    const pngBuf = fs.readFileSync(tmpPng);
    const outputBase64 = pngBuf.toString('base64');
    return toolText(JSON.stringify({ success: true, output_base64: outputBase64, size_bytes: pngBuf.length, renderer }));
  } catch (e: any) {
    return toolText(jsonError(`Export failed: ${e.message ?? e}`), true);
  } finally {
    cleanupTmpDir(tmpDir);
  }
}

function decodeBase64Content(b64: string): string {
  return Buffer.from(b64, 'base64').toString('utf-8');
}

/**
 * SA4E-406 (i): never ADD an <mxfile> wrapper — the layout tool writes bare
 * <mxGraphModel> and draw.io renders that fine. Only a bare <root> fragment
 * (no model around it) gets the missing model element.
 */
function wrapXmlIfNeeded(content: string): string {
  const trimmed = content.trim();
  if (trimmed.startsWith('<mxfile') || trimmed.startsWith('<?xml') || trimmed.startsWith('<mxGraphModel')) return content;
  return `<mxGraphModel>${trimmed}</mxGraphModel>`;
}

async function renderWithEngine(
  renderer: RendererType, inputPath: string, outputPath: string,
): Promise<void> {
  switch (renderer) {
    case 'drawio-cli': await exportWithCli(inputPath, outputPath); break;
    default: throw new Error('No renderer available. Install draw.io desktop.');
  }
}

function cleanupTmpDir(dir: string): void {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (err) { console.debug('[drawio-export-png] tmp cleanup skipped:', (err as Error).message); }
}

function jsonError(msg: string): string {
  return JSON.stringify({ success: false, error: msg });
}

function toolText(text: string, isError = false): unknown {
  return { content: [{ type: 'text', text }], isError };
}
