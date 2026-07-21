/**
 * MCP Handshake Regression Tests (SA4E-48)
 *
 * Guards against the exact failure that broke the VS Code MCP connection:
 *   Error: MPC -32601: Method not supported: initialize
 *
 * If anyone removes/renames the MCP lifecycle handlers in WrapperServer,
 * these tests MUST fail so the service MCP is never silently broken again.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WrapperServer } from '../services/WrapperServer';
import { createTestServer, postMcp, openSse, MockDeps } from './wrapper-server.helpers';

/** Methods a compliant MCP Streamable HTTP server must accept. */
const REQUIRED_METHODS = ['initialize', 'ping', 'tools/list', 'tools/call'] as const;

describe('MCP Handshake Regression (SA4E-48)', () => {
  let server: WrapperServer;
  let deps: MockDeps;
  let port: number;

  beforeAll(async () => {
    ({ server, deps } = createTestServer());
    await server.start(0);
    port = server.listeningPort!;
  });

  afterAll(async () => {
    await server.stop();
  });

  it('REG-01: initialize is implemented (no -32601 Method not supported)', async () => {
    const res = await postMcp(port, {
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'vscode', version: '1.128.0' },
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.error).toBeUndefined();
    expect(res.body.result).toBeDefined();
    // The exact error that previously broke the VS Code connection:
    expect(res.body.error?.code).not.toBe(-32601);
    const msg: string | undefined = res.body.error?.message;
    if (msg) {
      expect(msg).not.toMatch(/Method not supported: initialize/);
    }
  });

  it('REG-02: initialize returns protocolVersion, capabilities, serverInfo', async () => {
    const res = await postMcp(port, {
      jsonrpc: '2.0', id: 2, method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'x', version: '1' } },
    });

    const { result } = res.body;
    expect(result.protocolVersion).toBe('2024-11-05');
    expect(result.capabilities).toBeDefined();
    expect(result.serverInfo).toBeDefined();
    expect(result.serverInfo.name).toBe('sdlc-agents-4-enterprise');
  });

  it('REG-03: full handshake flow initialize -> initialized -> tools/list works', async () => {
    const init = await postMcp(port, {
      jsonrpc: '2.0', id: 3, method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'x', version: '1' } },
    });
    expect(init.body.result).toBeDefined();

    const ack = await postMcp(port, { jsonrpc: '2.0', method: 'notifications/initialized' });
    expect(ack.status).toBe(202);

    const list = await postMcp(port, { jsonrpc: '2.0', id: 4, method: 'tools/list', params: {} });
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body.result.tools)).toBe(true);
  });

  it('REG-04: ping responds with empty result (no -32601)', async () => {
    const res = await postMcp(port, { jsonrpc: '2.0', id: 5, method: 'ping' });
    expect(res.status).toBe(200);
    expect(res.body.error).toBeUndefined();
    expect(res.body.result).toEqual({});
  });

  it('REG-05: GET /mcp opens an SSE stream (Streamable HTTP transport)', async () => {
    const out = await openSse(port);
    expect(out.status).toBe(200);
    expect(out.contentType).toContain('text/event-stream');
    expect(out.chunk).toContain('event: message');
  });

  it('REG-06: every required MCP method returns a non-error response', async () => {
    for (const method of REQUIRED_METHODS) {
      const params = method === 'tools/list' || method === 'initialize'
        ? { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'x', version: '1' } }
        : method === 'tools/call'
          ? { name: 'mem_search', arguments: { query: 'x' } }
          : {};
      const res = await postMcp(port, { jsonrpc: '2.0', id: 100, method, params });
      const label = `method=${method}`;
      expect(res.body.error?.code, `${label} must not error`).not.toBe(-32601);
      if (res.body.error?.message) {
        expect(res.body.error.message, `${label} must not be unsupported`).not.toMatch(/Method not supported/);
      }
    }
  });

  it('REG-07: unknown/custom method still returns -32601 (handler intact)', async () => {
    const res = await postMcp(port, { jsonrpc: '2.0', id: 101, method: 'some_future_method' });
    expect(res.body.error?.code).toBe(-32601);
  });
});
