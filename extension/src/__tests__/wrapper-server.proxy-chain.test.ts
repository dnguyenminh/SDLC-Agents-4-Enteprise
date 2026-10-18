/**
 * WrapperServer Integration + E2E-API Tests (TC-22 to TC-31) — proxy chain.
 * Tests the full HTTP proxy chain: JSON-RPC → WrapperServer → mocked backend.
 * (Split from wrapper-server.test.ts — proxy-chain concern.)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { WrapperServer } from '../services/WrapperServer';
import {
  createTestServer, postMcp, TMP_DIR, ensureTmpDir, cleanTmpDir, MockDeps,
} from './wrapper-server.helpers';

describe('WrapperServer IT + E2E-API (TC-22 to TC-31)', () => {
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
    deps.restCallToolMock.result = {};
    // Ensure proxy detection is seeded (tools/list triggers detectFromToolList)
    await postMcp(port, { jsonrpc: '2.0', id: 0, method: 'tools/list', params: {} });
    deps.restCallToolMock.calls = [];
  });

  it('TC-22: tools/call routes file tool through full proxy chain', async () => {
    const inputFile = path.join(TMP_DIR, 'input.drawio');
    fs.writeFileSync(inputFile, '<mxGraphModel>test</mxGraphModel>');
    const pngB64 = Buffer.from('PNG-DATA').toString('base64');
    deps.restCallToolMock.result = {
      content: [{ type: 'text', text: JSON.stringify({ output_base64: pngB64 }) }],
    };

    const res = await postMcp(port, {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'drawio_export_png', arguments: { file_path: inputFile } },
    });

    expect(res.status).toBe(200);
    const call = deps.restCallToolMock.calls[0];
    expect(call.name).toBe('drawio_export_png');
    expect(call.args.content_base64).toBeDefined();
    const resultText = JSON.parse(res.body.result.content[0].text);
    expect(resultText.file_path).toBeDefined();
    expect(resultText.size_bytes).toBeGreaterThan(0);
    expect(fs.existsSync(resultText.file_path)).toBe(true);
  });

  it('TC-23: tools/list returns rewritten schemas via HTTP', async () => {
    const res = await postMcp(port, {
      jsonrpc: '2.0', id: 2, method: 'tools/list', params: {},
    });

    expect(res.status).toBe(200);
    const tools = res.body.result.tools;
    const drawioTool = tools.find((t: any) => t.name === 'drawio_export_png');
    expect(drawioTool).toBeDefined();
    const props = drawioTool.inputSchema.properties;
    expect(props.content_base64).toBeUndefined();
    expect(props.file_path).toBeDefined();
    expect(props.output_path).toBeDefined();
  });

  it('TC-24: execute_dynamic_tool unwraps and proxies via HTTP', async () => {
    const inputFile = path.join(TMP_DIR, 'dynamic.drawio');
    fs.writeFileSync(inputFile, '<mxGraphModel>dynamic</mxGraphModel>');
    const pngB64 = Buffer.from('DYN-PNG').toString('base64');
    deps.restCallToolMock.result = {
      content: [{ type: 'text', text: JSON.stringify({ output_base64: pngB64 }) }],
    };

    const res = await postMcp(port, {
      jsonrpc: '2.0', id: 3, method: 'tools/call',
      params: {
        name: 'execute_dynamic_tool',
        arguments: { toolName: 'drawio_export_png', arguments: { file_path: inputFile } },
      },
    });

    expect(res.status).toBe(200);
    const call = deps.restCallToolMock.calls[0];
    expect(call.args.arguments.content_base64).toBeDefined();
    const resultText = JSON.parse(res.body.result.content[0].text);
    expect(resultText.file_path).toBeDefined();
  });

  it('TC-25: find_tools response rewriting via execute_dynamic_tool', async () => {
    deps.restCallToolMock.result = {
      content: [{ type: 'text', text: JSON.stringify({ tools: deps.restGetToolsMock.tools }) }],
    };

    const res = await postMcp(port, {
      jsonrpc: '2.0', id: 4, method: 'tools/call',
      params: { name: 'execute_dynamic_tool', arguments: { toolName: 'find_tools', arguments: {} } },
    });

    expect(res.status).toBe(200);
    const parsed = JSON.parse(res.body.result.content[0].text);
    const drawio = parsed.tools.find((t: any) => t.name === 'drawio_export_png');
    expect(drawio.inputSchema.properties.content_base64).toBeUndefined();
    expect(drawio.inputSchema.properties.output_path).toBeDefined();
  });

  it('TC-37: find_tools response merges local tool definitions', async () => {
    deps.restCallToolMock.result = {
      content: [{ type: 'text', text: JSON.stringify({ tools: deps.restGetToolsMock.tools }) }],
    };

    const res = await postMcp(port, {
      jsonrpc: '2.0', id: 12, method: 'tools/call',
      params: { name: 'find_tools', arguments: { query: 'pega', top_k: 20 } },
    });

    expect(res.status).toBe(200);
    const parsed = JSON.parse(res.body.result.content[0].text);
    const names = parsed.tools.map((t: any) => t.name);
    expect(names).toContain('stream_write_file');
    expect(names).toContain('embed_image');
    expect(parsed.tools.length).toBeGreaterThanOrEqual(4);
  });

  it('TC-38: execute_dynamic_tool routes local tools (pega) without backend forward', async () => {
    const { server: s2, deps: d2 } = createTestServer();
    await s2.start(0);
    const p2 = s2.listeningPort!;

    const res = await postMcp(p2, {
      jsonrpc: '2.0', id: 13, method: 'tools/call',
      params: {
        name: 'execute_dynamic_tool',
        arguments: { toolName: 'stream_write_file', arguments: { file_path: path.join(TMP_DIR, 'dyn-local.txt'), content: 'y' } },
      },
    });

    await s2.stop();
    expect(res.status).toBe(200);
    expect(d2.restCallToolMock.calls).toHaveLength(0);
    const text = res.body.result.content[0].text;
    expect(text).toContain('Wrote file:');
  });

  it('TC-26: Non-file tool passes through without proxy', async () => {
    deps.restCallToolMock.result = { content: [{ type: 'text', text: '{"results":[]}' }] };

    const res = await postMcp(port, {
      jsonrpc: '2.0', id: 5, method: 'tools/call',
      params: { name: 'mem_search', arguments: { query: 'test' } },
    });

    expect(res.status).toBe(200);
    const call = deps.restCallToolMock.calls[0];
    expect(call.name).toBe('mem_search');
    expect(call.args).toEqual({ query: 'test' });
    expect(call.args.content_base64).toBeUndefined();
  });
});
