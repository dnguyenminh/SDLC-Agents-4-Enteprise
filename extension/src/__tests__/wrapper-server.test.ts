/**
 * WrapperServer Integration + E2E-API Tests (TC-22 to TC-31)
 * Tests the full HTTP proxy chain: JSON-RPC → WrapperServer → mocked backend.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';
import { WrapperServer } from '../services/WrapperServer';
import { evaluateOriginGate } from '../services/OriginGate';
import { Base64ProxyService } from '../services/Base64ProxyService';
import {
  createTestServer, postMcp, requestWithHeaders,
  assertNoAccessControlHeaders, sendRawRequest, createCapturingOutputChannel,
  openSse, TMP_DIR, ensureTmpDir, cleanTmpDir, MockDeps,
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

  it('TC-28: Body size limit returns clean 413 + JSON-RPC envelope (SA4E-363)', async () => {
    // Own server with the ORIGINAL 1 MB cap (post-fix default is 64 MB — a
    // 1 MB + 1 body is under-cap there by design, see IT-BODY-03). Injected
    // via WrapperServerDeps.maxBodyBytes — the same dep production wiring uses.
    const { server: capped } = createTestServer({ maxBodyBytes: 1024 * 1024 });
    await capped.start(0);
    try {
      // 1 MB + 1 byte — pre-fix: readBody() called req.destroy() → ECONNRESET
      // (the bug). requestWithHeaders REJECTS on a transport error, so a socket
      // reset fails this test outright: "the client actually reads the 413" is
      // structural here, not just asserted (AC-2).
      const res = await requestWithHeaders(capped.listeningPort!, {
        method: 'POST', path: '/mcp',
        headers: { 'Content-Type': 'application/json' },
        body: 'x'.repeat(1024 * 1024 + 1),
      });
      expect(res.status).toBe(413); // not 400 (sendError status param) / not 500 (sentinel escaped)
      expect(res.headers.connection?.toLowerCase()).toBe('close'); // no keep-alive reuse
      expect(JSON.parse(res.body)).toEqual({
        jsonrpc: '2.0',
        id: null, // protocol-legal — the body was never parsed
        error: { code: -32600, message: expect.stringContaining('body too large') },
      });
    } finally { await capped.stop(); }
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

/**
 * SA4E-358 Origin Gate — integration matrix T1..T14 (STC IT-01..14, mức 2).
 * Real WrapperServer on a RANDOM port (G-7 — never hardcoded 9181) with a
 * capturing outputChannel for deny-log assertions. T14 micro-sanity mirrors
 * bench-gate.ts; the full bench (10^6/class + e2e delta, evidence CSV) runs
 * on-demand per STC IT-14/FSD §8.1 — NOT in the default CI suite.
 */
describe('SA4E-358 Origin Gate (T1..T14)', () => {
  let server: WrapperServer;
  let deps: MockDeps;
  let port: number;
  let logLines: string[];

  beforeAll(async () => {
    ensureTmpDir();
    const channel = createCapturingOutputChannel();
    logLines = channel.lines;
    ({ server, deps } = createTestServer({ outputChannel: channel } as Partial<MockDeps>));
    await server.start(0);
    port = server.listeningPort!;
  });

  afterAll(async () => {
    await server.stop();
    cleanTmpDir();
  });

  beforeEach(() => {
    deps.restCallToolMock.calls = [];
    deps.restCallToolMock.result = { content: [{ type: 'text', text: '{}' }] };
  });

  /** Deny log lines emitted so far — each deny appends exactly 1 line (FR-09). */
  const deniedLogs = () => logLines.filter((l) => l.startsWith('[WrapperServer] Denied request'));
  /** Assert the deny-log count grew by exactly `n` with the expected reason + format (§7.3). */
  function expectDeniedLog(n: number, reason: string, from: number): void {
    const fresh = deniedLogs().slice(from);
    expect(fresh).toHaveLength(n);
    for (const line of fresh) {
      expect(line).toContain(`reason=${reason}`);
      expect(line).toMatch(/^\[WrapperServer\] Denied request — reason=\S+ origin=.* host=.* \(\S+ \S+\)$/);
    }
  }

  const rpc = (id: number, method: string, params?: unknown) =>
    JSON.stringify({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) });

  // ── T1 / IT-01: POST /mcp evil Origin — full deny before handleMcp ──
  it('T1 (IT-01): POST /mcp Origin evil → 403 + zero CORS + tool NOT executed + deny log', async () => {
    const before = deniedLogs().length;
    const res = await requestWithHeaders(port, {
      method: 'POST', path: '/mcp',
      headers: { Origin: 'https://evil.com', Host: `127.0.0.1:${port}`, 'Content-Type': 'application/json' },
      body: rpc(1, 'tools/call', { name: 'mem_search', arguments: { query: 'x' } }),
    });
    expect(res.status).toBe(403);
    assertNoAccessControlHeaders(res.headers);
    expect(res.body).toBe('{"error":"Forbidden"}');
    expect(res.headers['content-type']).toContain('application/json');
    expect(deps.restCallToolMock.calls).toHaveLength(0); // deny BEFORE handleMcp (AC-1/BO-2)
    expectDeniedLog(1, 'origin-not-allowed', before);
  });

  // ── T2 / IT-02: preflight evil → 403 (NOT 204), no Allow-* (P6-16 closed) ──
  it('T2 (IT-02): OPTIONS preflight evil → 403 + zero access-control headers', async () => {
    const before = deniedLogs().length;
    const res = await requestWithHeaders(port, {
      method: 'OPTIONS', path: '/mcp',
      headers: {
        Origin: 'https://evil.com', Host: `127.0.0.1:${port}`,
        'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'Content-Type',
      },
    });
    expect(res.status).toBe(403);
    assertNoAccessControlHeaders(res.headers); // includes Allow-Method*/Allow-Headers
    expect(res.body).toBe('{"error":"Forbidden"}');
    expectDeniedLog(1, 'origin-not-allowed', before);
  });

  // ── T3 / IT-03: native no-Origin session — pass-through, zero regression ──
  it('T3 (IT-03): full native session (no Origin) → current behavior + zero CORS (AC-4)', async () => {
    const before = deniedLogs().length;
    const session = async (body: string) => {
      const res = await requestWithHeaders(port, {
        method: 'POST', path: '/mcp',
        headers: { Host: `127.0.0.1:${port}`, 'Content-Type': 'application/json' },
        body,
      });
      // requestWithHeaders returns the RAW body string (helper spec) — 202 has
      // an empty body; parse only when present.
      return { ...res, body: res.body ? JSON.parse(res.body) : res.body };
    };
    const init = await session(rpc(20, 'initialize', { protocolVersion: '2024-11-05', capabilities: {} }));
    expect(init.status).toBe(200);
    expect(init.body.result.protocolVersion).toBe('2024-11-05');
    assertNoAccessControlHeaders(init.headers); // zero CORS for native (G-5, no ACAO assert)

    const notif = await session(rpc(0, 'notifications/initialized'));
    expect(notif.status).toBe(202);
    assertNoAccessControlHeaders(notif.headers);

    const list = await session(rpc(21, 'tools/list', {}));
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body.result.tools)).toBe(true);
    assertNoAccessControlHeaders(list.headers);

    for (let i = 0; i < 3; i++) {
      const call = await session(rpc(22 + i, 'tools/call', { name: 'mem_search', arguments: { query: `q${i}` } }));
      expect(call.status).toBe(200);
      assertNoAccessControlHeaders(call.headers);
    }
    expect(deps.restCallToolMock.calls).toHaveLength(3); // tools execute normally (UT-33 counterpart)
    expect(deniedLogs().length).toBe(before); // allowed session → NO new deny line (FSD §7.3)
  });

  // ── T4 / IT-04: preflight webview → 204 + echo EXACT + Allow-* + Vary ──
  it('T4 (IT-04): OPTIONS webview → 204 + ACAO echo EXACT + Allow-* + Vary: Origin', async () => {
    const res = await requestWithHeaders(port, {
      method: 'OPTIONS', path: '/mcp',
      headers: { Origin: 'vscode-webview://abc123', Host: `127.0.0.1:${port}` },
    });
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('vscode-webview://abc123'); // RAW echo (G-4)
    expect(res.headers['access-control-allow-methods']).toBe('GET, POST, OPTIONS');
    expect(res.headers['access-control-allow-headers']).toBe('Content-Type');
    expect(res.headers['vary']).toBe('Origin'); // SEC-358-03 (assert mềm per STC — implemented)
    for (const [k, v] of Object.entries(res.headers)) {
      if (k.startsWith('access-control-')) expect(String(v)).not.toContain('*'); // BR-07
    }
  });

  // ── T5 / IT-05: localhost origin → pass + echo + tool executes ──
  it('T5 (IT-05): POST localhost origin → 200 + echo + tool executes (origin port ≠ listen)', async () => {
    const res = await requestWithHeaders(port, {
      method: 'POST', path: '/mcp',
      headers: { Origin: 'http://localhost:3000', Host: `localhost:${port}`, 'Content-Type': 'application/json' },
      body: rpc(30, 'tools/call', { name: 'mem_search', arguments: { query: 'x' } }),
    });
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(deps.restCallToolMock.calls).toHaveLength(1);

    const variant = await requestWithHeaders(port, {
      method: 'POST', path: '/mcp',
      headers: { Origin: 'http://127.0.0.1:5173', Host: `127.0.0.1:${port}`, 'Content-Type': 'application/json' },
      body: rpc(31, 'tools/call', { name: 'mem_search', arguments: { query: 'y' } }),
    });
    expect(variant.status).toBe(200);
    expect(variant.headers['access-control-allow-origin']).toBe('http://127.0.0.1:5173');
  });

  // ── T6 / IT-06: Host variants with Origin — rebinding blocked + precedence ──
  it('T6 (IT-06): Host evil/port+1/missing/[::1] → 403 host-mismatch; both-fail precedence', async () => {
    const WEBVIEW = 'vscode-webview://abc';
    const post = (origin: string, host: string) => requestWithHeaders(port, {
      method: 'POST', path: '/mcp',
      headers: { Origin: origin, Host: host, 'Content-Type': 'application/json' },
      body: rpc(40, 'tools/call', { name: 'mem_search', arguments: {} }),
    });

    // 1) Host attacker.com
    let before = deniedLogs().length;
    let res = await post(WEBVIEW, `attacker.com:${port}`);
    expect(res.status).toBe(403);
    assertNoAccessControlHeaders(res.headers);
    expectDeniedLog(1, 'host-mismatch', before);

    // 2) Host port+1 (exact listen port — G-7 random port proves no hardcode)
    before = deniedLogs().length;
    res = await post(WEBVIEW, `127.0.0.1:${port + 1}`);
    expect(res.status).toBe(403);
    expectDeniedLog(1, 'host-mismatch', before);

    // 3) NO Host at all (HTTP/1.0-style + Origin) — raw socket: http.request
    //    always auto-adds Host (STC IT-06 step 3 note)
    before = deniedLogs().length;
    const raw = await sendRawRequest(port, `POST /mcp HTTP/1.0\r\nOrigin: ${WEBVIEW}\r\nConnection: close\r\n\r\n`);
    expect(raw.status).toBe(403);
    expect(raw.raw).not.toMatch(/access-control-/i);
    expectDeniedLog(1, 'host-mismatch', before);

    // 4) Host IPv6 literal
    before = deniedLogs().length;
    res = await post(WEBVIEW, `[::1]:${port}`);
    expect(res.status).toBe(403);
    expectDeniedLog(1, 'host-mismatch', before);

    // 5) BOTH fail — TDD §3.3 v1.1 precedence: Phase 1.5 (Host) runs FIRST →
    //    host-mismatch wins ("deny đầu tiên định reason"). NOTE for QA: STC
    //    IT-06 step 5 still asserts origin-not-allowed (v1.0 ordering leftover,
    //    superseded by AD-10/I-8) — TDD v1.1 + FSD BR-05 v1.2 are authoritative.
    before = deniedLogs().length;
    res = await post('https://evil.com', `attacker.com:${port}`);
    expect(res.status).toBe(403);
    expectDeniedLog(1, 'host-mismatch', before);

    expect(deps.restCallToolMock.calls).toHaveLength(0); // no variant reached the tool
  });

  // ── T7 / IT-07: SSE GET evil → 403 BEFORE any byte of the stream ──
  it('T7 (IT-07): GET /mcp SSE evil → 403, no SSE bytes; allowed branch still opens', async () => {
    const before = deniedLogs().length;
    const res = await requestWithHeaders(port, {
      method: 'GET', path: '/mcp',
      headers: { Origin: 'https://evil.com', Host: `127.0.0.1:${port}` },
    });
    expect(res.status).toBe(403);
    assertNoAccessControlHeaders(res.headers);
    expect(res.body).not.toContain('event:');
    expect(res.body).not.toContain('text/event-stream'); // P6-17 closed (AC-6)
    expectDeniedLog(1, 'origin-not-allowed', before);

    // Allowed branch: native no-Origin SSE opens as before (FR-10)
    const sse = await openSse(port);
    expect(sse.status).toBe(200);
    expect(sse.contentType).toContain('text/event-stream');
    expect(sse.chunk).toContain('event: message');
  });

  // ── T8 / IT-08: bind address invariant 127.0.0.1 (AC-7, verify-only) ──
  it('T8 (IT-08): server binds 127.0.0.1 with the real listen port (FR-11)', () => {
    expect(server.boundAddress).toBe('127.0.0.1');
    expect(server.listeningPort).toBe(port);
    expect(port).toBeGreaterThan(0);
  });

  // ── T9 / IT-09: anti log-forging — both defense layers proven ──
  it('T9 (IT-09): CRLF injection — client rejects; raw path 400; log sanitized', async () => {
    // Layer 1 — Node client/llhttp rejects control chars in header values.
    let rejected = false;
    try {
      await requestWithHeaders(port, {
        method: 'POST', path: '/mcp',
        headers: { Origin: 'https://evil.com\r\nX-Injected: 1\0more', Host: 'localhost\r\n:9181' },
        body: rpc(50, 'ping'),
      });
    } catch { rejected = true; }
    expect(rejected).toBe(true);

    // Layer 1b — raw socket with injected CRLF: llhttp answers 400 (or drops)
    // BEFORE the gate; the server must survive.
    const raw = await sendRawRequest(port,
      'POST /mcp HTTP/1.1\r\nHost: 127.0.0.1:%PORT%\r\nOrigin: https://evil.com\r\nX-Injected: 1\0more\r\nConnection: close\r\n\r\n'
        .replace('%PORT%', String(port)));
    expect(raw.status === 400 || raw.status === null).toBe(true);

    // Layer 2 — gate-internal sanitize: no captured log line carries \r \n \0.
    for (const line of logLines) {
      expect(/[\r\n\0]/.test(line)).toBe(false);
    }
    // Deny body shape is clean even for malformed callers (G-3/FR-08).
    const after = await requestWithHeaders(port, {
      method: 'POST', path: '/mcp',
      headers: { Origin: '%%', Host: `127.0.0.1:${port}`, 'Content-Type': 'application/json' },
      body: rpc(51, 'ping'),
    });
    expect(after.status).toBe(403);
    expect(after.body).toBe('{"error":"Forbidden"}');
  });

  // ── T10 / IT-10: malformed matrix — fail-closed, server never crashes ──
  it('T10 (IT-10): malformed origins → 403 malformed-origin; whitespace passes; server alive', async () => {
    const post = (origin?: string) => requestWithHeaders(port, {
      method: 'POST', path: '/mcp',
      headers: {
        Host: `127.0.0.1:${port}`, 'Content-Type': 'application/json',
        ...(origin === undefined ? {} : { Origin: origin }),
      },
      body: rpc(60, 'ping'),
    });

    const cases: Array<[string, boolean]> = [
      ['%%', true], ['http://a.com,http://b.com', true], ['localhost:3000', true],
    ];
    for (const [origin, deny] of cases) {
      const before = deniedLogs().length;
      const res = await post(origin);
      expect(res.status, `origin=${origin}`).toBe(deny ? 403 : 200);
      if (deny) {
        expect(res.body).toBe('{"error":"Forbidden"}');
        assertNoAccessControlHeaders(res.headers);
        expectDeniedLog(1, 'malformed-origin', before);
      }
    }

    // Whitespace-only Origin = absent after trim → no-Origin branch (NOT 403)
    const ws = await post('   ');
    expect(ws.status).toBe(200);
    assertNoAccessControlHeaders(ws.headers);

    // Duplicate Origin via raw socket — deny even though 1 value is valid
    const raw = await sendRawRequest(port,
      `POST /mcp HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nOrigin: vscode-webview://abc\r\nOrigin: https://evil.com\r\nContent-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}`);
    expect(raw.status).toBe(403);
    expect(raw.raw).toContain('Forbidden');

    // Server alive — next request processed (FR-12 / reliability)
    const health = await requestWithHeaders(port, { method: 'GET', path: '/health', headers: { Host: `127.0.0.1:${port}` } });
    expect(health.status).toBe(200);
    expect(JSON.parse(health.body)).toEqual({ status: 'ok', mode: 'wrapper' });
  });

  // ── T11 / IT-11: zero-CORS sweep — 5 routes × 3 branches = 15 responses ──
  it('T11 (IT-11): G-5 sweep — 15/15 responses match the no-CORS/echo matrix', async () => {
    const routes = [
      { method: 'GET', path: '/health', sse: false },
      { method: 'GET', path: '/mcp', sse: true },
      { method: 'POST', path: '/mcp', sse: false },
      { method: 'OPTIONS', path: '/mcp', sse: false },
      { method: 'GET', path: '/nonexistent', sse: false },
    ];
    const acKeys = (h: Record<string, unknown>) => Object.keys(h).filter((k) => k.startsWith('access-control-'));
    const send = (r: typeof routes[number], origin?: string) => requestWithHeaders(port, {
      method: r.method, path: r.path, closeOnFirstData: r.sse,
      headers: {
        Host: `127.0.0.1:${port}`,
        ...(r.method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
        ...(origin === undefined ? {} : { Origin: origin }),
      },
      body: r.method === 'POST' ? rpc(70, 'ping') : undefined,
    });

    for (const r of routes) {
      // evil → 403 + zero CORS on EVERY route (uniform — AD-3, AC-8)
      const evil = await send(r, 'https://evil.com');
      expect(evil.status, `evil ${r.method} ${r.path}`).toBe(403);
      expect(acKeys(evil.headers)).toHaveLength(0);

      // webview → ACAO echo on EVERY status (200/204/404 — G-5 uniform)
      const web = await send(r, 'vscode-webview://abc123');
      expect(web.headers['access-control-allow-origin']).toBe('vscode-webview://abc123');
      expect(acKeys(web.headers).length).toBeGreaterThanOrEqual(1);

      // no-Origin → zero CORS + current behavior (no ACAO assert — native)
      const native = await send(r);
      expect(acKeys(native.headers)).toHaveLength(0);
      const expected = r.path === '/nonexistent' ? 404 : r.method === 'OPTIONS' ? 204 : 200;
      expect(native.status, `native ${r.method} ${r.path}`).toBe(expected);
    }
  });

  // ── T12 / IT-12: raw-socket duplicates + no-Origin Host-evil (SEC-358-01) ──
  it('T12 (IT-12): raw socket — duplicate Origin/Host, lowercase key, no-Origin Host-evil', async () => {
    const rawPost = (headers: string, body = '{}') => sendRawRequest(port,
      `POST /mcp HTTP/1.1\r\n${headers}Content-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`);

    // 1) duplicate Origin → malformed-origin (NO first-wins — C-3/I-4)
    let before = deniedLogs().length;
    let raw = await rawPost(`Host: 127.0.0.1:${port}\r\nOrigin: vscode-webview://abc\r\nOrigin: https://evil.com\r\n`);
    expect(raw.status).toBe(403);
    expect(raw.raw).not.toMatch(/access-control-/i);
    expectDeniedLog(1, 'malformed-origin', before);

    // 2) duplicate Host → host-mismatch (smuggling fail-closed)
    before = deniedLogs().length;
    raw = await rawPost(`Host: 127.0.0.1:${port}\r\nHost: evil.com:${port}\r\nOrigin: vscode-webview://abc\r\n`);
    expect(raw.status).toBe(403);
    expectDeniedLog(1, 'host-mismatch', before);

    // 3) lowercase `origin:` key — still detected (case-insensitive keys)
    before = deniedLogs().length;
    raw = await rawPost(`Host: 127.0.0.1:${port}\r\norigin: https://evil.com\r\n`);
    expect(raw.status).toBe(403);
    expectDeniedLog(1, 'origin-not-allowed', before);

    // 4) SEC-358-01 / I-8 — raw request WITHOUT Origin + Host attacker.com
    before = deniedLogs().length;
    raw = await rawPost(`Host: attacker.com:${port}\r\n`);
    expect(raw.status).toBe(403);
    expect(raw.raw).toContain('Forbidden');
    expectDeniedLog(1, 'host-mismatch', before);

    expect(deps.restCallToolMock.calls).toHaveLength(0);
  });

  // ── T13 / IT-13: preflight matrix — 7 rows × ACAM present/absent = 14 ──
  it('T13 (IT-13): preflight matrix 14/14 matches preflight-matrix.csv (ACAM ignored)', async () => {
    type Row = { id: string; origin?: string; host: string; status: number; acao?: string; reason?: string };
    const P = String(port);
    const rows: Row[] = [
      { id: '1a', host: `127.0.0.1:${P}`, status: 204 }, // no-Origin + loopback (AD-8)
      { id: '1b', host: `attacker.com:${P}`, status: 403, reason: 'host-mismatch' }, // SEC-358-01/I-8
      { id: '2', origin: 'vscode-webview://abc123', host: `127.0.0.1:${P}`, status: 204, acao: 'vscode-webview://abc123' },
      { id: '3', origin: 'http://localhost:3000', host: `localhost:${P}`, status: 204, acao: 'http://localhost:3000' },
      { id: '4', origin: 'https://evil.com', host: `127.0.0.1:${P}`, status: 403, reason: 'origin-not-allowed' },
      { id: '5', origin: 'vscode-webview://abc', host: `attacker.com:${P}`, status: 403, reason: 'host-mismatch' }, // FR-04
      { id: '6', origin: '%%', host: `127.0.0.1:${P}`, status: 403, reason: 'malformed-origin' }, // FR-12
    ];
    for (const row of rows) {
      for (const acam of [true, false]) {
        const before = deniedLogs().length;
        const res = await requestWithHeaders(port, {
          method: 'OPTIONS', path: '/mcp',
          headers: {
            Host: row.host,
            ...(row.origin === undefined ? {} : { Origin: row.origin }),
            ...(acam ? { 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'Content-Type' } : {}),
          },
        });
        expect(res.status, `row ${row.id} acam=${acam}`).toBe(row.status);
        if (row.acao) {
          expect(res.headers['access-control-allow-origin']).toBe(row.acao);
          expect(res.headers['access-control-allow-methods']).toBe('GET, POST, OPTIONS');
        } else {
          assertNoAccessControlHeaders(res.headers);
        }
        if (row.reason) expectDeniedLog(1, row.reason, before);
      }
    }
  });

  // ── T14 / IT-14: gate overhead sanity (full bench = bench-gate.ts, on-demand) ──
  it('T14 (IT-14): gate micro-overhead — p99 of a 20k-call sample < 1ms (NFR)', () => {
    const headers = ['Host', `127.0.0.1:${port}`, 'Origin', 'vscode-webview://abc123'];
    for (let i = 0; i < 2000; i++) evaluateOriginGate(headers, port); // warmup
    const samples: number[] = [];
    for (let i = 0; i < 20_000; i++) {
      const t0 = process.hrtime.bigint();
      evaluateOriginGate(headers, port);
      samples.push(Number(process.hrtime.bigint() - t0) / 1000); // µs
    }
    samples.sort((a, b) => a - b);
    const p99 = samples[Math.floor(samples.length * 0.99)];
    expect(p99).toBeLessThan(1000); // < 1ms (expected <10µs)
  });
});
