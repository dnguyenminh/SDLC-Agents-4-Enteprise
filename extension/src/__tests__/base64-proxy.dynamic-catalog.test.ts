import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
vi.mock('vscode', () => ({
  workspace: { workspaceFolders: [{ uri: { fsPath: process.cwd() } }] },
}));
import * as fs from 'fs';
import * as path from 'path';
import { Base64ProxyService } from '../services/Base64ProxyService';

const TMP = path.join(__dirname, '.tmp-proxy-dynamic');

/** Catalog entry as emitted by the backend's find_tools (schema, not inputSchema). */
const EXPORT_DOCX_CATALOG = {
  name: 'export_docx',
  description: 'Export a Markdown file to DOCX. Returns output_base64 when invoked through the extension wrapper.',
  schema: {
    type: 'object',
    properties: {
      markdown: { type: 'string' },
      content_base64: { type: 'string' },
      file_name: { type: 'string' },
    },
    required: ['markdown'],
    'x-content-param': 'markdown',
    'x-output-base64': true,
  },
} as const;

describe('Base64ProxyService — dynamic catalog schemas', () => {
  beforeAll(() => { if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true }); });
  afterAll(() => { if (fs.existsSync(TMP)) fs.rmSync(TMP, { recursive: true, force: true }); });

  it('detects input/output proxy from the `schema` field (find_tools)', () => {
    const service = new Base64ProxyService(TMP);
    service.registerTools([EXPORT_DOCX_CATALOG as any]);
    expect(service.needsInputProxy('export_docx')).toBe(true);
    expect(service.needsOutputProxy('export_docx')).toBe(true);
  });

  it('registerTools adds without dropping tools/list detections', () => {
    const service = new Base64ProxyService(TMP);
    service.detectFromToolList([{
      name: 'drawio_export_png',
      description: 'Export to PNG. Returns output_base64.',
      inputSchema: { type: 'object', properties: { content_base64: { type: 'string' } }, required: ['content_base64'] },
    } as any]);
    service.registerTools([EXPORT_DOCX_CATALOG as any]);
    expect(service.needsInputProxy('drawio_export_png')).toBe(true);
    expect(service.needsInputProxy('export_docx')).toBe(true);
  });

  it('rewrites the catalog schema in place and hides the backend content arg', () => {
    const service = new Base64ProxyService(TMP);
    service.registerTools([EXPORT_DOCX_CATALOG as any]);
    const [rewritten] = service.rewriteSchemasForLlm([EXPORT_DOCX_CATALOG as any]) as any[];

    const schema = rewritten.schema;
    expect(rewritten.inputSchema).toBeUndefined();
    expect(schema.properties.content_base64).toBeUndefined();
    expect(schema.properties.markdown).toBeUndefined();
    expect(schema.properties.file_path).toBeDefined();
    expect(schema.properties.output_path).toBeDefined();
    expect(schema.required).toContain('file_path');
    expect(schema.required).not.toContain('markdown');
    expect(rewritten.description).toContain('output_base64');
  });

  it('writes every file for multi-output results', () => {
    const service = new Base64ProxyService(TMP);
    service.registerTools([EXPORT_DOCX_CATALOG as any]);
    const response = {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          outputs: [
            { file_name: 'a.json', output_base64: Buffer.from('A').toString('base64') },
            { file_name: 'b.json', output_base64: Buffer.from('B').toString('base64') },
          ],
        }),
      }],
    };

    const result = service.proxyOutput('export_docx', { output_path: 'out/result.json' }, response);

    expect(fs.readFileSync(path.join(TMP, 'out', 'a.json')).toString()).toBe('A');
    expect(fs.readFileSync(path.join(TMP, 'out', 'b.json')).toString()).toBe('B');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.outputs).toHaveLength(2);
    expect(parsed.outputs[0].output_base64).toBeUndefined();
    expect(parsed.file_path).toBe(path.join(TMP, 'out', 'a.json'));
  });
});
