import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
vi.mock('vscode', () => ({
  workspace: {
    workspaceFolders: [{ uri: { fsPath: process.cwd() } }]
  }
}));
import * as fs from 'fs';
import * as path from 'path';
import { Base64ProxyService } from '../services/Base64ProxyService';
import { TMP_DIR, BASE64_DETECT_TOOLS, DRAWIO_INPUT_TOOL, DRAWIO_NO_CBASE64_TOOL, EXPORT_DOCX_TOOL } from './backend-local-tools.fixtures';

describe('Base64ProxyService', () => {
  let service: Base64ProxyService;

  beforeAll(() => {
    if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
    service = new Base64ProxyService();
    service.detectFromToolList([...BASE64_DETECT_TOOLS]);
  });

  afterAll(() => {
    if (fs.existsSync(TMP_DIR)) {
      fs.rmSync(TMP_DIR, { recursive: true, force: true });
    }
  });

  it('TC-12: Should auto-detect input proxy tools from schema', () => {
    expect(service.needsInputProxy('drawio_export_png')).toBe(true);
    expect(service.needsInputProxy('mem_ingest_file')).toBe(true);
    expect(service.needsInputProxy('code_search')).toBe(false);
  });

  it('TC-13: Should auto-detect output proxy tools from description', () => {
    expect(service.needsOutputProxy('drawio_export_png')).toBe(true);
    expect(service.needsOutputProxy('mem_ingest_file')).toBe(false);
    expect(service.needsOutputProxy('code_search')).toBe(false);
  });

  it('TC-14: proxyInput reads file and injects content_base64', () => {
    const filePath = path.join(TMP_DIR, 'proxy-input.txt');
    fs.writeFileSync(filePath, 'hello proxy');
    const result = service.proxyInput('drawio_export_png', { file_path: filePath });
    expect(result.content_base64).toBe(Buffer.from('hello proxy').toString('base64'));
    expect(result.file_path).toBe(filePath);
  });

  it('TC-15: proxyInput throws on missing file', () => {
    expect(() => {
      service.proxyInput('drawio_export_png', { file_path: '/nonexistent.drawio' });
    }).toThrow(/Failed to read file/);
  });

  it('TC-44: proxyInput resolves relative file_path against the workspace root (D2 regression)', () => {
    const rooted = new Base64ProxyService(TMP_DIR);
    rooted.detectFromToolList([DRAWIO_INPUT_TOOL]);
    fs.writeFileSync(path.join(TMP_DIR, 'rel-input.txt'), 'relative hello');
    const result = rooted.proxyInput('drawio_export_png', { file_path: 'rel-input.txt' });
    expect(result.content_base64).toBe(Buffer.from('relative hello').toString('base64'));
    // Absolute paths stay unchanged
    const abs = path.join(TMP_DIR, 'rel-input.txt');
    const absResult = rooted.proxyInput('drawio_export_png', { file_path: abs });
    expect(absResult.file_path).toBe(abs);
    // Missing relative file reports the workspace-resolved path
    expect(() => rooted.proxyInput('drawio_export_png', { file_path: 'nope.txt' }))
      .toThrow(new RegExp(`Failed to read file ${path.join(TMP_DIR, 'nope.txt').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  });

  it('TC-45: proxyOutput resolves relative output_path against the workspace root (D2 regression)', () => {
    const rooted = new Base64ProxyService(TMP_DIR);
    rooted.detectFromToolList([DRAWIO_NO_CBASE64_TOOL]);
    const b64 = Buffer.from('ROOTED-PNG').toString('base64');
    const mockResult = { content: [{ type: 'text', text: JSON.stringify({ output_base64: b64 }) }] };
    const result = rooted.proxyOutput(
      'drawio_export_png',
      { file_path: 'rel-input.drawio' },
      mockResult
    );
    const expectedOut = path.join(TMP_DIR, 'rel-input.png');
    expect(fs.existsSync(expectedOut)).toBe(true);
    expect(fs.readFileSync(expectedOut).toString()).toBe('ROOTED-PNG');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.file_path).toBe(expectedOut);
  });

  it('TC-46: proxyOutput honours a backend-suggested file_name next to the source', () => {
    const rooted = new Base64ProxyService(TMP_DIR);
    rooted.detectFromToolList([EXPORT_DOCX_TOOL as any]);
    const b64 = Buffer.from('DOCX-BYTES').toString('base64');
    const mockResult = { content: [{ type: 'text', text: JSON.stringify({ output_base64: b64, file_name: 'BRD-v1.docx' }) }] };

    const result = rooted.proxyOutput('export_docx', { file_path: 'documents/BRD-embedded.md' }, mockResult);

    const expected = path.join(TMP_DIR, 'documents', 'BRD-v1.docx');
    expect(fs.readFileSync(expected).toString()).toBe('DOCX-BYTES');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.file_path).toBe(expected);
    expect(parsed.output_base64).toBeUndefined();
  });

  it('TC-47: proxyOutput strips path fragments from a suggested file_name', () => {
    const rooted = new Base64ProxyService(TMP_DIR);
    rooted.detectFromToolList([EXPORT_DOCX_TOOL as any]);
    const mockResult = { content: [{ type: 'text', text: JSON.stringify({ output_base64: Buffer.from('X').toString('base64'), file_name: '../../evil.docx' }) }] };

    rooted.proxyOutput('export_docx', { file_path: 'documents/BRD-embedded.md' }, mockResult);

    expect(fs.existsSync(path.join(TMP_DIR, 'documents', 'evil.docx'))).toBe(true);
    expect(fs.existsSync(path.join(TMP_DIR, '..', 'evil.docx'))).toBe(false);
  });

  it('TC-16: proxyInput passes through if tool not in set', () => {
    const args = { query: 'test' };
    const result = service.proxyInput('code_search', args);
    expect(result).toBe(args);
  });

  it('TC-17: proxyOutput writes base64 to file', () => {
    const outPath = path.join(TMP_DIR, 'output.png');
    const b64 = Buffer.from('PNG data').toString('base64');
    const mockResult = { content: [{ type: 'text', text: JSON.stringify({ output_base64: b64 }) }] };
    const result = service.proxyOutput(
      'drawio_export_png',
      { file_path: path.join(TMP_DIR, 'input.drawio'), output_path: outPath },
      mockResult
    );
    expect(fs.existsSync(outPath)).toBe(true);
    expect(fs.readFileSync(outPath).toString()).toBe('PNG data');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.file_path).toBe(outPath);
    expect(parsed.output_base64).toBeUndefined();
  });

  it('TC-18: rewriteSchemasForLlm hides content_base64, adds output_path', () => {
    const tools = service.rewriteSchemasForLlm([
      {
        name: 'drawio_export_png',
        description: 'Export. Returns output_base64.',
        inputSchema: {
          type: 'object',
          properties: {
            file_path: { type: 'string' },
            content_base64: { type: 'string' },
          },
          required: ['content_base64'],
        },
      },
    ]);
    const schema = tools[0].inputSchema!;
    const props = schema.properties as Record<string, any>;
    expect(props.content_base64).toBeUndefined();
    expect(props.file_path).toBeDefined();
    expect(props.output_path).toBeDefined();
    expect((schema.required as string[])).toContain('file_path');
    expect((schema.required as string[])).not.toContain('content_base64');
  });

  it('TC-19: unwrapDynamicTool extracts nested toolName and arguments', () => {
    const result = service.unwrapDynamicTool({
      toolName: 'drawio_export_png',
      arguments: { file_path: '/test.drawio' },
    });
    expect(result).not.toBeNull();
    expect(result!.toolName).toBe('drawio_export_png');
    expect(result!.innerArgs.file_path).toBe('/test.drawio');
  });

  it('TC-20: unwrapDynamicTool handles tool_name variant', () => {
    const result = service.unwrapDynamicTool({
      tool_name: 'mem_ingest_file',
      args: { file_path: '/data.txt' },
    });
    expect(result).not.toBeNull();
    expect(result!.toolName).toBe('mem_ingest_file');
    expect(result!.innerArgs.file_path).toBe('/data.txt');
  });

  it('TC-21: unwrapDynamicTool returns null for missing toolName', () => {
    const result = service.unwrapDynamicTool({ random: 'data' });
    expect(result).toBeNull();
  });
});
