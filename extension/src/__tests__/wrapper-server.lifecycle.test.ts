/**
 * WrapperServer Integration + E2E-API Tests (TC-22 to TC-31) — lifecycle:
 * notifications, SSE stream, port takeover and EADDRINUSE recovery.
 * (Split from wrapper-server.test.ts — lifecycle concern.)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { WrapperServer } from '../services/WrapperServer';
import {
  createTestServer, postMcp, ensureTmpDir, cleanTmpDir, MockDeps,
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
