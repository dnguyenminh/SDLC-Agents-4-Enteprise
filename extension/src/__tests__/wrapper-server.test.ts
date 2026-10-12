/**
 * WrapperServer Integration + E2E-API Tests (TC-22 to TC-31)
 * Tests the full HTTP proxy chain: JSON-RPC → WrapperServer → mocked backend.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';
import { WrapperServer } from '../services/WrapperServer';
import { Base64ProxyService } from '../services/Base64ProxyService';
import {
  createTestServer, postMcp, postRaw,
  TMP_DIR, ensureTmpDir, cleanTmpDir, MockDeps,
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

  it('TC-27: PBT — any schema with content_base64 is detected', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }).filter((s) => /^[a-z_]+$/.test(s)),
        (toolName) => {
          const { deps: localDeps } = createTestServer();
          const tool = {
            name: toolName,
            description: 'A tool.',
            inputSchema: {
              type: 'object',
              properties: { file_path: { type: 'string' }, content_base64: { type: 'string' } },
              required: ['content_base64'],
            },
          };
          localDeps.base64Proxy.detectFromToolList([tool]);
          return localDeps.base64Proxy.needsInputProxy(toolName) === true;
        },
      ),
      { numRuns: 50 },
    );
  });

  it('TC-28: Body size limit rejects oversized requests', async () => {
    const oversized = Buffer.alloc(1024 * 1024 + 1, 'x');
    const result = await postRaw(port, oversized);
    expect(result.status === null || result.error !== undefined || result.status !== 200).toBe(true);
  });

  it('TC-29: Rejected path returns a TOOL error result, not JSON-RPC -32603 (SA4E-356 §5.6)', async () => {
    const res = await postMcp(port, {
      jsonrpc: '2.0', id: 7, method: 'tools/call',
      params: { name: 'drawio_export_png', arguments: { file_path: '/does/not/exist.drawio' } },
    });

    // PathResolverError → MCP tool error result (agent-readable), never a
    // JSON-RPC protocol error. The absolute path escapes the TMP_DIR workspace
    // root, so containment rejects it before any fs touch (I-1, C-4).
    expect(res.body.error).toBeUndefined();
    expect(res.body.result.isError).toBe(true);
    expect(res.body.result.content[0].text).toContain('PATH_REJECTED_OUTSIDE_WORKSPACE:');
    expect(res.body.result.content[0].text).toContain(path.resolve('/does/not/exist.drawio'));
  });

  it('TC-42: relative file_path resolves against the workspace root (D2 regression)', async () => {
    const relName = 'relative-input.drawio';
    const content = '<mxGraphModel>relative</mxGraphModel>';
    fs.writeFileSync(path.join(TMP_DIR, relName), content);
    deps.restCallToolMock.result = {
      content: [{ type: 'text', text: JSON.stringify({ output_base64: Buffer.from('PNG-REL').toString('base64') }) }],
    };

    const res = await postMcp(port, {
      jsonrpc: '2.0', id: 14, method: 'tools/call',
      params: { name: 'drawio_export_png', arguments: { file_path: relName } },
    });

    expect(res.status).toBe(200);
    const call = deps.restCallToolMock.calls[0];
    expect(call.name).toBe('drawio_export_png');
    // File was read from the workspace root, not process.cwd() (Kiro install dir)
    expect(call.args.content_base64).toBe(Buffer.from(content).toString('base64'));
    // Derived output also lands inside the workspace root as an absolute path
    const resultText = JSON.parse(res.body.result.content[0].text);
    expect(path.isAbsolute(resultText.file_path)).toBe(true);
    expect(resultText.file_path.startsWith(TMP_DIR)).toBe(true);
  });

  it('TC-43: relative file_path outside the workspace root fails with resolved path in error (D2 regression, SA4E-356 §5.6)', async () => {
    const res = await postMcp(port, {
      jsonrpc: '2.0', id: 15, method: 'tools/call',
      params: { name: 'drawio_export_png', arguments: { file_path: 'missing-under-root.drawio' } },
    });

    // SA4E-356: pre-read failure is a TOOL error result (not -32603) carrying
    // the workspace-resolved absolute path.
    expect(res.body.error).toBeUndefined();
    expect(res.body.result.isError).toBe(true);
    expect(res.body.result.content[0].text).toContain('FS_ERROR: Failed to read file');
    expect(res.body.result.content[0].text).toContain(path.join(TMP_DIR, 'missing-under-root.drawio'));
  });

  it('TC-30: Backend unreachable returns JSON-RPC error', async () => {
    const { server: s2, deps: d2 } = createTestServer({
      restCallTool: async () => { throw new Error('ECONNREFUSED'); },
    } as any);
    await s2.start(0);
    const p2 = s2.listeningPort!;

    const res = await postMcp(p2, {
      jsonrpc: '2.0', id: 8, method: 'tools/call',
      params: { name: 'mem_search', arguments: { query: 'x' } },
    });

    await s2.stop();
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe(-32603);
    expect(res.body.error.message).toContain('ECONNREFUSED');
  });

  it('TC-31: Invalid JSON body returns parse error', async () => {
    const res = await postMcp(port, 'not-valid-json{{');

    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe(-32700);
    expect(res.body.error.message).toContain('Parse error');
  });

  it('TC-32: initialize returns negotiated protocol + capabilities', async () => {
    const res = await postMcp(port, {
      jsonrpc: '2.0', id: 9, method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'kilo-check', version: '1.0.0' },
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.result).toBeDefined();
    expect(res.body.result.protocolVersion).toBe('2024-11-05');
    expect(res.body.result.capabilities.tools).toBeDefined();
    expect(res.body.result.serverInfo.name).toBe('sdlc-agents-4-enterprise');
  });

  it('TC-33: initialize negotiates newest known version for unknown client', async () => {
    const res = await postMcp(port, {
      jsonrpc: '2.0', id: 10, method: 'initialize',
      params: { protocolVersion: '2099-01-01', capabilities: {}, clientInfo: { name: 'x', version: '1' } },
    });

    expect(res.body.result.protocolVersion).toBe('2025-06-18');
  });

  it('TC-34: ping returns empty result', async () => {
    const res = await postMcp(port, { jsonrpc: '2.0', id: 11, method: 'ping' });
    expect(res.status).toBe(200);
    expect(res.body.result).toEqual({});
  });

  it('TC-35: notifications/initialized returns 202 with no body', async () => {
    const res = await postMcp(port, { jsonrpc: '2.0', method: 'notifications/initialized' });
    expect(res.status).toBe(202);
    expect(res.body).toBe('');
  });

  it('TC-36: GET /mcp opens SSE stream', async () => {
    const http = await import('http');
    const net = await import('net');
    const get$: Promise<{ status: number; contentType: string; chunk: string }> = new Promise((resolve, reject) => {
      const req = http.request(
        { host: '127.0.0.1', port, path: '/mcp', method: 'GET', timeout: 3000 },
        (r) => {
          let data = '';
          r.on('data', (c) => {
            data += c;
            if (data.includes('event: message')) {
              resolve({ status: r.statusCode!, contentType: r.headers['content-type'] || '', chunk: data });
              req.destroy();
            }
          });
          r.on('error', reject);
        },
      );
      req.on('error', reject);
      req.end();
    });
    const out = await get$;
    expect(out.status).toBe(200);
    expect(out.contentType).toContain('text/event-stream');
    expect(out.chunk).toContain('event: message');
  });

  it('TC-40: starting on an occupied port stops the stale instance (reload safety)', async () => {
    const { server: first } = createTestServer();
    await first.start(0);
    const busyPort = first.listeningPort!;

    const { server: second } = createTestServer();
    await second.start(busyPort);

    expect(second.listeningPort).toBe(busyPort);
    expect(first.listeningPort).toBeNull();

    await second.stop();
  });

  it('TC-41: starting on a port held by an external process retries until it is freed (EADDRINUSE recovery)', async () => {
    const http = await import('node:http');
    // Simulate a stale process (from a previous extension host) still holding the port.
    const blocker = http.createServer(() => {});
    await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve));
    const busyPort = (blocker.address() as import('node:net').AddressInfo).port;

    const { server } = createTestServer();
    // Release the port shortly after the first EADDRINUSE attempt so the retry can succeed.
    setTimeout(() => blocker.close(), 250);

    await server.start(busyPort);
    expect(server.listeningPort).toBe(busyPort);

    await server.stop();
  });
});

describe('WrapperServer SA4E-356 (STC IT-05 wrapper, IT-06, envelope)', () => {
  let server: WrapperServer;
  let deps: MockDeps;

  beforeAll(async () => {
    ensureTmpDir();
    ({ server, deps } = createTestServer());
    // Register mem_ingest_file as an input-proxy tool (backend-style schema
    // WITHOUT a file_path description — the M-1 hole) and seed detection.
    deps.restGetToolsMock.tools.push({
      name: 'mem_ingest_file',
      description: 'Ingest a file into memory.',
      inputSchema: {
        type: 'object',
        properties: {
          file_path: { type: 'string' },
          content_base64: { type: 'string', description: 'Base64 file content' },
        },
        required: ['content_base64'],
      },
    } as any);
    await server.start(0);
    const port = server.listeningPort!;
    await postMcp(port, { jsonrpc: '2.0', id: 0, method: 'tools/list', params: {} });
  });

  afterAll(async () => {
    await server.stop();
    cleanTmpDir();
  });

  beforeEach(() => {
    deps.restCallToolMock.calls = [];
    deps.restCallToolMock.result = {};
  });

  // STC: IT-05 wrapper path — relative resolves under the workspace root
  // (string-mode TMP_DIR), content_base64 filled, absolute path forwarded.
  it('INT-5 wrapper: mem_ingest_file relative resolves + pre-reads', async () => {
    const rel = 'wrapper-ingest.txt';
    fs.writeFileSync(path.join(TMP_DIR, rel), 'wrapper hello', 'utf-8');
    deps.restCallToolMock.result = { content: [{ type: 'text', text: '{"ok":true}' }] };
    const result = await server.routeToolCall({
      name: 'mem_ingest_file', arguments: { file_path: rel },
    });
    expect(deps.restCallToolMock.calls).toHaveLength(1);
    const forwarded = deps.restCallToolMock.calls[0].args;
    expect(forwarded.file_path).toBe(path.join(TMP_DIR, rel));
    expect(forwarded.content_base64).toBe(Buffer.from('wrapper hello').toString('base64'));
    expect(result).toEqual({ content: [{ type: 'text', text: '{"ok":true}' }] });
  });

  // STC: IT-05 — containment on the wrapper path + tool-result envelope.
  it('INT-5 wrapper: escape yields a tool error result, never -32603', async () => {
    const result: any = await server.routeToolCall({
      name: 'mem_ingest_file', arguments: { file_path: '../escape.txt' },
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('PATH_REJECTED_OUTSIDE_WORKSPACE:');
    expect(deps.restCallToolMock.calls).toHaveLength(0);
  });

  // STC: IT-05 — provider/string parity through the live routeToolCall path.
  it('INT-5 wrapper: provider-mode proxy agrees with string mode', async () => {
    const { server: s2, deps: d2 } = createTestServer();
    (d2 as any).base64Proxy = new Base64ProxyService(() => TMP_DIR);
    const rel = 'wrapper-parity.txt';
    fs.writeFileSync(path.join(TMP_DIR, rel), 'parity', 'utf-8');
    (d2 as any).base64Proxy.detectFromToolList(deps.restGetToolsMock.tools);
    d2.restCallToolMock.result = { content: [{ type: 'text', text: '{}' }] };
    const result = await s2.routeToolCall({
      name: 'mem_ingest_file', arguments: { file_path: rel },
    });
    expect(d2.restCallToolMock.calls).toHaveLength(1);
    expect(d2.restCallToolMock.calls[0].args.content_base64)
      .toBe(Buffer.from('parity').toString('base64'));
    expect(result.isError).not.toBe(true);
  });

  // STC: IT-06 — explicit relative output_path resolves under the workspace.
  it('INT-6: relative output_path resolves under the workspace root', async () => {
    const input = path.join(TMP_DIR, 'int6-input.drawio');
    fs.writeFileSync(input, '<mxGraphModel>int6</mxGraphModel>', 'utf-8');
    const pngB64 = Buffer.from('INT6-PNG').toString('base64');
    const mockResult = { content: [{ type: 'text', text: JSON.stringify({ output_base64: pngB64 }) }] };
    const out = deps.base64Proxy.proxyOutput(
      'drawio_export_png', { file_path: input, output_path: 'custom/out.png' }, mockResult,
    );
    const expected = path.join(TMP_DIR, 'custom', 'out.png');
    expect(fs.existsSync(expected)).toBe(true);
    expect(JSON.parse(out.content[0].text).file_path).toBe(expected);
  });

  // STC: IT-06 — derived output for non-.drawio input gets .out appended (M-2).
  it('INT-6: derived output for non-drawio input appends .out', async () => {
    const input = path.join(TMP_DIR, 'int6-input.txt');
    fs.writeFileSync(input, 'plain', 'utf-8');
    const pngB64 = Buffer.from('INT6-TXT').toString('base64');
    const mockResult = { content: [{ type: 'text', text: JSON.stringify({ output_base64: pngB64 }) }] };
    const out = deps.base64Proxy.proxyOutput(
      'drawio_export_png', { file_path: input }, mockResult,
    );
    expect(JSON.parse(out.content[0].text).file_path).toBe(input + '.out');
    expect(fs.existsSync(input + '.out')).toBe(true);
  });
});
