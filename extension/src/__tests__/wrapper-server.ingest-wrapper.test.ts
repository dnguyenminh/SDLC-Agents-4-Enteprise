/**
 * WrapperServer SA4E-356 (STC IT-05 wrapper, IT-06, envelope) — mem_ingest_file
 * wrapper path, provider/string parity, output_path resolution.
 * (Split from wrapper-server.test.ts — ingest-wrapper concern.)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { WrapperServer } from '../services/WrapperServer';
import { Base64ProxyService } from '../services/Base64ProxyService';
import {
  createTestServer, postMcp, TMP_DIR, ensureTmpDir, cleanTmpDir, MockDeps,
} from './wrapper-server.helpers';

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
