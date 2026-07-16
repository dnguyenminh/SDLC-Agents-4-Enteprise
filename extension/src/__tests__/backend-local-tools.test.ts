import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { executeLocalTool, getLocalToolDefinitions } from '../backend-local-tools';
import { Base64ProxyService } from '../services/Base64ProxyService';

const TMP_DIR = path.join(__dirname, '.tmp-local-tools');

describe('Backend Local Tools (E2E Tests)', () => {
  beforeAll(() => {
    if (fs.existsSync(TMP_DIR)) {
      fs.rmSync(TMP_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TMP_DIR, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(TMP_DIR)) {
      fs.rmSync(TMP_DIR, { recursive: true, force: true });
    }
  });

  describe('stream_write_file', () => {
    it('TC-01: Should create a new file and parent directories (mode: write)', async () => {
      const nestedPath = path.join(TMP_DIR, 'nested', 'test1.txt');
      const result = await executeLocalTool('stream_write_file', {
        file_path: nestedPath,
        content: 'Hello World',
        mode: 'write'
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('Wrote file:');
      const fileContent = fs.readFileSync(nestedPath, 'utf-8');
      expect(fileContent).toBe('Hello World');
    });

    it('TC-02: Should overwrite an existing file (mode: write)', async () => {
      const filePath = path.join(TMP_DIR, 'test2.txt');
      fs.writeFileSync(filePath, 'Old Content');
      const result = await executeLocalTool('stream_write_file', {
        file_path: filePath,
        content: 'New Content',
        mode: 'write'
      });

      expect(result.isError).toBe(false);
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      expect(fileContent).toBe('New Content');
    });

    it('TC-03: Should append to an existing file (mode: append)', async () => {
      const filePath = path.join(TMP_DIR, 'test3.txt');
      fs.writeFileSync(filePath, 'Line 1\n');
      const result = await executeLocalTool('stream_write_file', {
        file_path: filePath,
        content: 'Line 2',
        mode: 'append'
      });

      expect(result.isError).toBe(false);
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      expect(fileContent).toBe('Line 1\nLine 2');
    });

    it('TC-04: Should return error for missing file_path', async () => {
      const result = await executeLocalTool('stream_write_file', {
        content: 'Hello',
        mode: 'write'
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("'file_path' and 'content' required");
    });
  });

  describe('embed_image', () => {
    it('TC-05: Should inline a local PNG image as base64 data URI', async () => {
      const imgPath = path.join(TMP_DIR, 'dummy.png');
      fs.writeFileSync(imgPath, Buffer.from('dummy-image-data'));
      const mdPath = path.join(TMP_DIR, 'doc.md');
      fs.writeFileSync(mdPath, 'Check this image: ![Alt Text](dummy.png "Title")');

      const result = await executeLocalTool('embed_image', { file_path: mdPath });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('Embedded 1 image(s)');
      const outPath = path.join(TMP_DIR, 'doc-embedded.md');
      expect(fs.existsSync(outPath)).toBe(true);
      const outContent = fs.readFileSync(outPath, 'utf-8');
      const base64Data = Buffer.from('dummy-image-data').toString('base64');
      expect(outContent).toContain(`![Alt Text](data:image/png;base64,${base64Data} "Title")`);
    });

    it('TC-06: Should skip remote URLs and data URIs', async () => {
      const mdPath = path.join(TMP_DIR, 'remote.md');
      const content = '![Remote](http://example.com/img.png) ![Data](data:image/jpeg;base64,123)';
      fs.writeFileSync(mdPath, content);
      const result = await executeLocalTool('embed_image', { file_path: mdPath });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('skipped 2');
      const outPath = path.join(TMP_DIR, 'remote-embedded.md');
      const outContent = fs.readFileSync(outPath, 'utf-8');
      expect(outContent).toBe(content);
    });

    it('TC-07: Should skip missing local images without crashing', async () => {
      const mdPath = path.join(TMP_DIR, 'missing.md');
      const content = '![Missing](not-found.png)';
      fs.writeFileSync(mdPath, content);
      const result = await executeLocalTool('embed_image', { file_path: mdPath });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('skipped 1');
      const outPath = path.join(TMP_DIR, 'missing-embedded.md');
      const outContent = fs.readFileSync(outPath, 'utf-8');
      expect(outContent).toBe(content);
    });
  });

  describe('getLocalToolDefinitions', () => {
    it('TC-10: Should return schemas for local tools', () => {
      const defs = getLocalToolDefinitions();
      expect(defs.length).toBe(2);
      expect(defs.map(d => d.name)).toEqual(['stream_write_file', 'embed_image']);
    });
  });

  describe('Unknown Tool Fallback', () => {
    it('TC-11: Should return an error for unknown local tools', async () => {
      const result = await executeLocalTool('unknown_tool', {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Local tool 'unknown_tool' not implemented");
    });
  });
});

describe('Base64ProxyService', () => {
  let service: Base64ProxyService;

  beforeAll(() => {
    if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
    service = new Base64ProxyService();
    service.detectFromToolList([
      {
        name: 'drawio_export_png',
        description: 'Export drawio to PNG. Returns output_base64 field.',
        inputSchema: {
          type: 'object',
          properties: {
            file_path: { type: 'string' },
            content_base64: { type: 'string', description: 'Base64 file content' },
          },
          required: ['content_base64'],
        },
      },
      {
        name: 'mem_ingest_file',
        description: 'Ingest a file into memory.',
        inputSchema: {
          type: 'object',
          properties: {
            file_path: { type: 'string' },
            content_base64: { type: 'string', description: 'Base64 encoded file content' },
          },
          required: ['content_base64'],
        },
      },
      {
        name: 'code_search',
        description: 'Search code in the project.',
        inputSchema: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query'],
        },
      },
    ]);
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
