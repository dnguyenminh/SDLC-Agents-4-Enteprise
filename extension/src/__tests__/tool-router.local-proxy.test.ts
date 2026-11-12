/**
 * SA4E-406 (qa B5 / security M1) — local base64 tools route through the
 * Base64ProxyService exactly like remote ones: file_path → content_base64
 * injected on the way in, output_base64 → output_path written back. A local
 * tool WITHOUT the base64 contract (drawio_auto_layout) stays direct.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const executeLocalToolMock = vi.hoisted(() => vi.fn());
vi.mock('../backend-local-tools', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, executeLocalTool: executeLocalToolMock };
});

import { ToolRouter } from '../services/WrapperServer/tool-router';
import { Base64ProxyService } from '../services/Base64ProxyService';
import { getLocalToolDefinitions } from '../backend-local-tools';

const router = (root: string): ToolRouter => new ToolRouter({
  outputChannel: { appendLine: () => {} } as any,
  base64Proxy: new Base64ProxyService(root),
  restGetTools: async () => [],
  restCallTool: async () => ({}),
} as any);

const pngResult = (): unknown => ({
  content: [{ type: 'text', text: JSON.stringify({
    success: true, output_base64: Buffer.from('PNG-BYTES').toString('base64'),
    size_bytes: 9, renderer: 'drawio-cli',
  }) }],
});

describe('SA4E-406 drawio_export_png contract (qa B5)', () => {
  let root = '';
  beforeEach(() => {
    executeLocalToolMock.mockReset();
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dio-router-')));
  });

  it('injects content_base64 from file_path and writes output_base64 back to output_path', async () => {
    const drawio = path.join(root, 'diagram.drawio');
    fs.writeFileSync(drawio, '<mxGraphModel/>');
    executeLocalToolMock.mockResolvedValue(pngResult());

    const result = await router(root).routeToolCall({
      name: 'drawio_export_png',
      arguments: { file_path: drawio },
    });

    const call = executeLocalToolMock.mock.calls[0];
    expect(call[0]).toBe('drawio_export_png');
    expect(call[1].content_base64).toBe(Buffer.from('<mxGraphModel/>').toString('base64'));
    const out = JSON.parse((result as any).content[0].text);
    expect(out.file_path).toBe(path.join(root, 'diagram.png')); // .drawio → .png
    expect(out.size_bytes).toBe(9);
    expect(out.output_base64).toBeUndefined();
    expect(fs.readFileSync(path.join(root, 'diagram.png'), 'utf-8')).toBe('PNG-BYTES');
  });

  it('keeps an explicit output_path and honors base_dir', async () => {
    const drawio = path.join(root, 'd2.drawio');
    fs.writeFileSync(drawio, '<mxGraphModel/>');
    fs.mkdirSync(path.join(root, 'out'));
    executeLocalToolMock.mockResolvedValue(pngResult());

    await router(root).routeToolCall({
      name: 'drawio_export_png',
      arguments: { file_path: drawio, output_path: 'out/render.png' },
    });

    expect(fs.readFileSync(path.join(root, 'out', 'render.png'), 'utf-8')).toBe('PNG-BYTES');
  });

  it('leaves a local tool without a base64 contract untouched', async () => {
    executeLocalToolMock.mockResolvedValue({ content: [{ type: 'text', text: '{}' }] });
    await router(root).routeToolCall({
      name: 'drawio_auto_layout',
      arguments: { file_path: path.join(root, 'x.drawio') },
    });
    const args = executeLocalToolMock.mock.calls[0][1];
    expect(args.content_base64).toBeUndefined();
    expect(args.file_path).toBe(path.join(root, 'x.drawio'));
  });

  it('detects the local base64 contract from the tool definitions themselves', () => {
    const def = getLocalToolDefinitions().find(d => d.name === 'drawio_export_png');
    expect(def).toBeDefined();
    const props = (def as any).inputSchema.properties;
    expect(props.content_base64).toBeDefined(); // detection marker for the proxy
  });
});
