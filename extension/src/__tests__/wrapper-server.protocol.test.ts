/**
 * WrapperServer Integration + E2E-API Tests (TC-22 to TC-31) — protocol,
 * body limit, path errors, initialize/ping concern.
 * (Split from wrapper-server.test.ts — protocol concern.)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';
import { WrapperServer } from '../services/WrapperServer';
import {
  createTestServer, postMcp, TMP_DIR, ensureTmpDir, cleanTmpDir, MockDeps,
} from './wrapper-server.helpers';
import { requestWithHeaders } from './wrapper-server.http.helpers';

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
});
