/**
 * drawio_export_png — Export .drawio file to PNG image.
 * Priority: 1) draw.io CLI, 2) chrome-devtools-mcp, 3) puppeteer-mcp
 */
import * as fs from 'fs';
import * as path from 'path';
import pino from 'pino';
import { setCachedDrawioCliPath, exportWithCli, exportWithChrome, exportWithPuppeteer, findDrawioCli, hasUpstreamServer } from './drawio-renderers.js';

const logger = pino({ name: 'drawio-export-png' });

export const DRAWIO_EXPORT_PNG_DEFINITION = {
  name: 'drawio_export_png',
  description: 'Export a .drawio diagram file to PNG image. Returns the relative path to the exported PNG file.',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: 'Relative path to .drawio file (relative to workspace root)',
      },
    },
    required: ['file_path'],
  },
};

type RendererType = 'drawio-cli' | 'chrome-devtools-mcp' | 'puppeteer-mcp' | 'none';

let cachedRenderer: RendererType | null = null;

export function detectRenderer(orchestrationEngine?: any): RendererType {
  if (cachedRenderer !== null) return cachedRenderer;
  const cliPath = findDrawioCli();
  if (cliPath) {
    setCachedDrawioCliPath(cliPath);
    cachedRenderer = 'drawio-cli';
    return cachedRenderer;
  }
  if (orchestrationEngine && hasUpstreamServer(orchestrationEngine, 'chrome-devtools-mcp')) {
    cachedRenderer = 'chrome-devtools-mcp';
    return cachedRenderer;
  }
  if (orchestrationEngine && hasUpstreamServer(orchestrationEngine, 'puppeteer')) {
    cachedRenderer = 'puppeteer-mcp';
    return cachedRenderer;
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
  orchestrationEngine?: any
): Promise<string> {
  const rawPath = args.file_path as string | undefined;
  if (!rawPath) return jsonError('file_path is required');
  const filePath = path.isAbsolute(rawPath) ? rawPath : path.resolve(workspace, rawPath);
  if (!fs.existsSync(filePath)) return jsonError(`File not found: ${rawPath}`);
  if (!filePath.endsWith('.drawio')) return jsonError('File must have .drawio extension');
  const pngPath = filePath.replace(/\.drawio$/, '.png');
  const relativePngPath = path.relative(workspace, pngPath).replace(/\\/g, '/');
  
  let content = fs.readFileSync(filePath, 'utf-8');
  let renderPath = filePath;
  let tmpPath: string | null = null;
  
  if (!content.trim().startsWith('<mxfile') && !content.trim().startsWith('<?xml')) {
    content = `<?xml version="1.0" encoding="UTF-8"?>\n<mxfile host="app.diagrams.net">\n${content}\n</mxfile>`;
    tmpPath = filePath + '.tmp.drawio';
    fs.writeFileSync(tmpPath, content, 'utf-8');
    renderPath = tmpPath;
  }

  const renderer = detectRenderer(orchestrationEngine);
  try {
    switch (renderer) {
      case 'drawio-cli':
        await exportWithCli(renderPath, pngPath);
        break;
      case 'chrome-devtools-mcp':
        await exportWithChrome(renderPath, pngPath, workspace, orchestrationEngine);
        break;
      case 'puppeteer-mcp':
        await exportWithPuppeteer(renderPath, pngPath, workspace, orchestrationEngine);
        break;
      default:
        if (tmpPath) fs.unlinkSync(tmpPath);
        return jsonError('No renderer available. Install draw.io desktop or configure chrome-devtools-mcp.');
    }
    
    if (tmpPath) {
      fs.unlinkSync(tmpPath);
    }
    if (!fs.existsSync(pngPath)) {
      return jsonError(`Export failed — PNG file was not created at ${relativePngPath}`);
    }
    const stats = fs.statSync(pngPath);
    return JSON.stringify({ success: true, file_path: relativePngPath, size_bytes: stats.size, renderer });
  } catch (e: any) {
    if (tmpPath && fs.existsSync(tmpPath)) {
      fs.unlinkSync(tmpPath);
    }
    return jsonError(`Export failed: ${e.message ?? e}`);
  }
}

function jsonError(msg: string): string {
  return JSON.stringify({ success: false, error: msg });
}
