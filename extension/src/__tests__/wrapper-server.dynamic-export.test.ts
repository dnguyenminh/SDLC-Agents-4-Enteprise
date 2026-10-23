/**
 * WrapperServer E2E — dynamic file tool (export_docx) discovered via find_tools.
 * Proves the contract: LLM sends file_path/output_path, the wrapper reads the
 * source, the backend returns output_base64, the wrapper writes the artifact.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { WrapperServer } from '../services/WrapperServer';
import {
  createTestServer, postMcp, TMP_DIR, ensureTmpDir, cleanTmpDir, MockDeps,
} from './wrapper-server.helpers';

/** Catalog entry as returned by the backend after content-proxy adaptation. */
const CATALOG = {
  tools: [{
    name: 'export_docx',
    description: 'Export Markdown content to a DOCX document. Returns output_base64 (base64 file bytes) when invoked through the extension wrapper.',
    schema: {
      type: 'object',
      properties: {
        markdown: { type: 'string' },
        content_base64: { type: 'string' },
        file_name: { type: 'string' },
      },
      required: [],
      'x-content-param': 'markdown',
      'x-output-base64': true,
    },
  }],
};

describe('WrapperServer — dynamic file tool (export_docx)', () => {
  let server: WrapperServer;
  let deps: MockDeps;
  let port: number;

  beforeAll(async () => {
    ensureTmpDir();
    ({ server, deps } = createTestServer());
    await server.start(0);
    port = server.listeningPort!;
  });

  afterAll(async () => {
    await server.stop();
    cleanTmpDir();
  });

  beforeEach(async () => {
    deps.restCallToolMock.calls = [];
    // Discover the dynamic tool (this seeds proxy detection from the catalog schema).
    deps.restCallToolMock.result = { content: [{ type: 'text', text: JSON.stringify(CATALOG) }] };
    await postMcp(port, {
      jsonrpc: '2.0', id: 0, method: 'tools/call',
      params: { name: 'find_tools', arguments: { query: 'export docx', top_k: 5 } },
    });
    deps.restCallToolMock.calls = [];
  });

  it('rewrites the catalog schema for the LLM (file_path/output_path, no content args)', async () => {
    const res = await postMcp(port, {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'find_tools', arguments: { query: 'export docx', top_k: 5 } },
    });
    const parsed = JSON.parse(res.body.result.content[0].text);
    const tool = parsed.tools.find((t: any) => t.name === 'export_docx');
    const schema = tool.schema;

    expect(schema.properties.file_path).toBeDefined();
    expect(schema.properties.output_path).toBeDefined();
    expect(schema.properties.content_base64).toBeUndefined();
    expect(schema.properties.markdown).toBeUndefined();
    expect(schema.required).toContain('file_path');
    expect(schema.required).not.toContain('markdown');
    expect(tool.inputSchema).toBeUndefined();
  });

  it('reads file_path, forwards content_base64 and writes the returned bytes', async () => {
    const inputDir = path.join(TMP_DIR, 'documents');
    fs.mkdirSync(inputDir, { recursive: true });
    const input = path.join(inputDir, 'UG.md');
    const output = path.join(inputDir, 'UG-v1.docx');
    fs.writeFileSync(input, '# User Guide\n\nNội dung tiếng Việt.');

    deps.restCallToolMock.result = {
      content: [{
        type: 'text',
        text: JSON.stringify({ success: true, file_name: 'UG-v1.docx', size_bytes: 4, output_base64: Buffer.from('DOCX').toString('base64') }),
      }],
      isError: false,
    };

    const res = await postMcp(port, {
      jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: {
        name: 'execute_dynamic_tool',
        arguments: { toolName: 'export_docx', arguments: { file_path: input, output_path: output } },
      },
    });

    const forwarded = deps.restCallToolMock.calls[0].args.arguments;
    expect(forwarded.content_base64).toBe(Buffer.from('# User Guide\n\nNội dung tiếng Việt.').toString('base64'));
    expect(forwarded.file_path).toBe(input);
    expect(forwarded.output_path).toBe(output);

    expect(fs.readFileSync(output).toString()).toBe('DOCX');
    const parsed = JSON.parse(res.body.result.content[0].text);
    expect(parsed.output_base64).toBeUndefined();
    expect(parsed.file_path).toBe(output);
    expect(parsed.size_bytes).toBe(4);
  });

  it('auto-detects the schema on first use (no prior find_tools call)', async () => {
    const calls: Array<{ name: string; args: any }> = [];
    const { server: lazyServer } = createTestServer({
      restCallTool: (async (name: string, args: any) => {
        calls.push({ name, args });
        if (name === 'find_tools') {
          return { content: [{ type: 'text', text: JSON.stringify(CATALOG) }] };
        }
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: true, file_name: 'lazy.docx', output_base64: Buffer.from('LAZY').toString('base64') }) }],
          isError: false,
        };
      }) as any,
    });
    await lazyServer.start(0);
    const lazyPort = lazyServer.listeningPort!;

    const input = path.join(TMP_DIR, 'lazy.md');
    const output = path.join(TMP_DIR, 'lazy.docx');
    fs.writeFileSync(input, '# lazy');
    await postMcp(lazyPort, {
      jsonrpc: '2.0', id: 3, method: 'tools/call',
      params: {
        name: 'execute_dynamic_tool',
        arguments: { toolName: 'export_docx', arguments: { file_path: input, output_path: output } },
      },
    });
    await lazyServer.stop();

    expect(calls.map((c) => c.name)).toEqual(['find_tools', 'execute_dynamic_tool']);
    expect(calls[1].args.arguments.content_base64).toBe(Buffer.from('# lazy').toString('base64'));
    expect(fs.readFileSync(output).toString()).toBe('LAZY');
  });

  it('fails loudly instead of returning a path when the backend yields no bytes', async () => {
    const input = path.join(TMP_DIR, 'no-bytes.md');
    const output = path.join(TMP_DIR, 'no-bytes.docx');
    fs.writeFileSync(input, '# no bytes');
    fs.rmSync(output, { force: true });

    deps.restCallToolMock.result = {
      content: [{
        type: 'text',
        text: JSON.stringify({ success: true, artifacts: [{ name: 'no-bytes.docx', size: 123 }] }),
      }],
      isError: false,
    };

    const res = await postMcp(port, {
      jsonrpc: '2.0', id: 4, method: 'tools/call',
      params: {
        name: 'execute_dynamic_tool',
        arguments: { toolName: 'export_docx', arguments: { file_path: input, output_path: output } },
      },
    });

    expect(res.body.result.isError).toBe(true);
    expect(res.body.result.content[0].text).toMatch(/ARTIFACT_FETCH_FAILED/);
    expect(fs.existsSync(output)).toBe(false);
  });
});
