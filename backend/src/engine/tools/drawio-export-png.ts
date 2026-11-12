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
import {
  hasBaseDirArg,
  type MultiWorktreePathResolver,
} from '../../shared/multi-worktree-path-resolver.js';
import { getSharedPathResolver } from '../../shared/path-resolver-provider.js';
import { baseDirSchemaProperties } from '../../shared/base-dir-schema.js';

const logger = pino({ name: 'drawio-export-png' });

export const DRAWIO_EXPORT_PNG_DEFINITION = {
  name: 'drawio_export_png',
  description: 'Render .drawio XML content (base64) to a PNG using the draw.io CLI (fallback: chrome-devtools-mcp / puppeteer-mcp). Returns output_base64 (PNG bytes). Through the SDLC extension proxy callers pass file_path/output_path instead of base64. Does not modify the source diagram.',
  inputSchema: {
    type: 'object',
    properties: {
      content_base64: { type: 'string', description: 'Base64-encoded .drawio XML content' },
      file_path: { type: 'string', description: 'Path of the source .drawio file (reference only here; the extension proxy reads it and supplies content_base64).' },
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
    const xml = wrapXmlIfNeeded(content);
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

function wrapXmlIfNeeded(content: string): string {
  const trimmed = content.trim();
  if (trimmed.startsWith('<mxfile') || trimmed.startsWith('<?xml') || trimmed.startsWith('<mxGraphModel')) return content;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<mxfile host="app.diagrams.net">\n<diagram name="Page-1">\n${content}\n</diagram>\n</mxfile>`;
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
