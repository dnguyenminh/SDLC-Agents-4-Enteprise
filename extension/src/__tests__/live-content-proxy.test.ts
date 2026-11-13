/**
 * LIVE E2E (not part of CI): wrapper + real backend content proxy.
 * Run with: $env:LIVE_BACKEND='1'; npx vitest run src/__tests__/live-content-proxy.test.ts
 *
 * Verifies the generic contract for every exporter the child server exposes:
 *   file_path → content_base64 → backend (markdown) → artifact → output_base64 → output_path
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
vi.mock('vscode', () => ({
  workspace: { workspaceFolders: [{ uri: { fsPath: process.cwd() } }] },
}));
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { WrapperServer } from '../services/WrapperServer';
import { createTestServer, postMcp, TMP_DIR, ensureTmpDir, cleanTmpDir } from './wrapper-server.helpers';

function rpc(body: unknown): Promise<any> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      { hostname: '127.0.0.1', port: 48721, path: '/mcp', method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          Accept: 'application/json, text/event-stream',
        } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try {
            const text = Buffer.concat(chunks).toString('utf-8').replace(/^event: message\s*data: /, '');
            resolve(JSON.parse(text));
          } catch (e) { reject(e); }
        });
      },
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function liveCallTool(name: string, args: Record<string, unknown>): Promise<any> {
  const res = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
  if (res.error) throw new Error(JSON.stringify(res.error));
  return res.result;
}

async function liveGetTools(): Promise<any> {
  const res = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  return res.result;
}

const EXPORTERS: Array<{ tool: string; ext: string; magic: string }> = [
  { tool: 'export_docx', ext: 'docx', magic: 'PK' },
  { tool: 'export_xlsx', ext: 'xlsx', magic: 'PK' },
  { tool: 'export_pptx', ext: 'pptx', magic: 'PK' },
  { tool: 'export_pdf', ext: 'pdf', magic: '%PDF' },
  { tool: 'export_html', ext: 'html', magic: '<' },
  { tool: 'export_json', ext: 'json', magic: '{' },
];

describe.skipIf(!process.env.LIVE_BACKEND)('LIVE content proxy (wrapper → backend)', () => {
  let server: WrapperServer;
  let port: number;

  beforeAll(async () => {
    ensureTmpDir();
    ({ server } = createTestServer({ restCallTool: liveCallTool, restGetTools: liveGetTools } as any));
    await server.start(0);
    port = server.listeningPort!;
  });

  afterAll(async () => {
    await server.stop();
    cleanTmpDir();
  });

  const MARKDOWN = [
    '# Live E2E',
    '',
    'Nội dung kiểm thử **content proxy**.',
    '',
    '| Cột A | Cột B |',
    '|---|---|',
    '| 1 | 2 |',
    '',
    '- một',
    '- hai',
    '',
  ].join('\n');

  it.each(EXPORTERS)('$tool: file_path → output_path produces a valid .$ext', async ({ tool, ext, magic }) => {
    const dir = path.join(TMP_DIR, 'live');
    fs.mkdirSync(dir, { recursive: true });
    const source = path.join(dir, `${tool}-source.md`);
    const output = path.join(dir, `${tool}-output.${ext}`);
    fs.writeFileSync(source, MARKDOWN);

    const res = await postMcp(port, {
      jsonrpc: '2.0', id: 3, method: 'tools/call',
      params: {
        name: 'execute_dynamic_tool',
        arguments: {
          toolName: tool,
          arguments: { file_path: source, output_path: output, file_name: `${tool}-output` },
        },
      },
    });

    expect(res.status).toBe(200);
    const errorText = res.body.error ? JSON.stringify(res.body.error) : res.body.result?.content?.[0]?.text;
    expect(errorText ?? '').not.toMatch(/Missing content|Invalid content_base64/);
    expect(fs.existsSync(output)).toBe(true);

    const bytes = fs.readFileSync(output);
    expect(bytes.length).toBeGreaterThan(0);
    expect(bytes.subarray(0, magic.length).toString('latin1')).toBe(magic);

    const parsed = JSON.parse(res.body.result.content[0].text);
    expect(parsed.output_base64).toBeUndefined();
    expect(parsed.file_path).toBe(output);
    expect(parsed.size_bytes).toBe(bytes.length);
  }, 120000);
});
