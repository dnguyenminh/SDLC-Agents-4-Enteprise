import * as fs from 'fs';
import { execSync } from 'child_process';

let _cachedDrawioCliPath: string | null = null;

export function setCachedDrawioCliPath(path: string | null): void {
  _cachedDrawioCliPath = path;
}

export function getCachedDrawioCliPath(): string | null {
  return _cachedDrawioCliPath;
}

export function findDrawioCli(): string | null {
  if (_cachedDrawioCliPath) return _cachedDrawioCliPath;
  const candidates: string[] = [];
  if (process.platform === 'win32') {
    candidates.push(
      'C:\\Program Files\\draw.io\\draw.io.exe',
      `${process.env.LOCALAPPDATA || ''}\\Programs\\draw.io\\draw.io.exe`,
      `${process.env.PROGRAMFILES || ''}\\draw.io\\draw.io.exe`,
    );
  } else if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/draw.io.app/Contents/MacOS/draw.io',
      '/usr/local/bin/drawio',
      `${process.env.HOME || ''}/Applications/draw.io.app/Contents/MacOS/draw.io`,
    );
  } else {
    candidates.push(
      '/usr/bin/drawio',
      '/usr/local/bin/drawio',
      '/snap/bin/drawio',
      `${process.env.HOME || ''}/.local/bin/drawio`,
    );
  }
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  try {
    const which = process.platform === 'win32' ? 'where drawio 2>nul' : 'which drawio';
    const result = execSync(which, { timeout: 5000, stdio: 'pipe' }).toString().trim();
    if (result && fs.existsSync(result.split('\n')[0])) return result.split('\n')[0];
  } catch (err) { console.debug('[drawio-renderers] not in PATH :', (err as Error).message); }
  return null;
}

/**
 * SA4E-410 (DISC-4) — scale factors tried in order by the CLI exporter.
 *
 * draw.io Desktop renders through a GPU-backed compositor. When the diagram
 * canvas is very large (tens of thousands of pixels) the GPU process aborts
 * with "GPU process exited unexpectedly" and the CLI then exits with code 0
 * while writing NO png at all. Retrying the very same command reproduces the
 * crash, so the exporter degrades the render scale until the canvas fits.
 */
const CLI_SCALE_FALLBACKS = [1, 0.75, 0.5, 0.25];

export async function exportWithCli(inputPath: string, outputPath: string): Promise<void> {
  if (!_cachedDrawioCliPath) throw new Error('draw.io CLI path not cached');

  let lastError = '';
  for (const scale of CLI_SCALE_FALLBACKS) {
    const scaleArg = scale === 1 ? '' : ` --scale ${scale}`;
    const cmd = `"${_cachedDrawioCliPath}" --export --format png --border 10${scaleArg} --output "${outputPath}" "${inputPath}"`;
    try {
      execSync(cmd, { timeout: 30000, stdio: 'pipe' });
    } catch (err) {
      lastError = (err as Error).message;
    }
    if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) return;
    // The CLI exited without producing an image — drop any empty artifact
    // before the next attempt.
    try { fs.unlinkSync(outputPath); } catch { /* no artifact to remove */ }
  }
  throw new Error(
    `draw.io CLI produced no PNG at any scale (${CLI_SCALE_FALLBACKS.join(', ')})${lastError ? `: ${lastError}` : ''}`
  );
}

export async function exportWithChrome(
  inputPath: string,
  outputPath: string,
  _workspace: string,
  orchestrationEngine: any
): Promise<void> {
  const xml = fs.readFileSync(inputPath, 'utf-8');
  const encoded = Buffer.from(xml).toString('base64');
  const viewerUrl = `https://viewer.diagrams.net/?lightbox=1&nav=0#R${encoded}`;
  await orchestrationEngine.executeUpstreamTool('chrome-devtools-mcp', 'navigate_page', {
    type: 'url', url: viewerUrl, timeout: 15000,
  });
  await sleep(3000);
  await orchestrationEngine.executeUpstreamTool('chrome-devtools-mcp', 'take_screenshot', {
    format: 'png', fullPage: true, filePath: outputPath,
  });
}

export async function exportWithPuppeteer(
  inputPath: string,
  outputPath: string,
  _workspace: string,
  orchestrationEngine: any
): Promise<void> {
  const xml = fs.readFileSync(inputPath, 'utf-8');
  const encoded = Buffer.from(xml).toString('base64');
  const viewerUrl = `https://viewer.diagrams.net/?lightbox=1&nav=0#R${encoded}`;
  await orchestrationEngine.executeUpstreamTool('puppeteer', 'navigate', { url: viewerUrl });
  await sleep(3000);
  await orchestrationEngine.executeUpstreamTool('puppeteer', 'screenshot', { path: outputPath, fullPage: true });
}

export function hasUpstreamServer(orchestrationEngine: any, serverName: string): boolean {
  try {
    const status = orchestrationEngine.getStatus?.();
    if (!status?.servers) return false;
    return status.servers.some((s: any) =>
      s.name?.toLowerCase().includes(serverName.toLowerCase()) && s.state === 'ACTIVE'
    );
  } catch (err) {
    console.debug('[drawio-renderers] orchestration status check failed, assuming no upstream server:', (err as Error).message);
    return false;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
