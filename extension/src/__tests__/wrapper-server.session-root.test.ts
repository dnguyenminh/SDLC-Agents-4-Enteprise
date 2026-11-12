/**
 * SA4E-406 A6/A7 — WrapperServer MCP session workspace binding (STC-style IT).
 * Real HTTP server via createTestServer (shared helpers — no duplicates):
 * `initialize` may declare a workspace root (clientInfo.workspaceRoot), which
 * is validated with the A7 parents rule (env MCP_WORKSPACE_ROOT_PARENTS) and
 * bound per session id / per connection; later tools/call resolve RELATIVE
 * file_path against the SESSION ROOT first (rootSource "session" — A8).
 * An UNSET root ⇒ byte-identical legacy behaviour (no header, no field).
 *
 * NOTE on sockets: Node pools keep-alive sockets per agent. Tests that assert
 * session binding share ONE explicit agent (mirrors a real client session);
 * tests that assert the UNBOUND legacy path use a FRESH agent per request so
 * no socket-bound root from a previous test leaks into them (isolation only —
 * production clients use their own connection pool).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import {
  createTestServer, postMcp, TMP_DIR, ensureTmpDir, cleanTmpDir, MockDeps,
} from './wrapper-server.helpers';

const BASE = path.join(TMP_DIR, 'session-roots');
const PARENT = path.join(BASE, 'trusted-parent');
const SESSION_WS = path.join(PARENT, 'wt-session'); // admitted via parent
const UNTRUSTED_WS = path.join(BASE, 'untrusted'); // under nothing

const envBackup = process.env.MCP_WORKSPACE_ROOT_PARENTS;
let server: WrapperServer;
let deps: MockDeps;
const logLines: string[] = [];

/** postMcp + response headers + optional explicit agent (session capture). */
function postMcpRaw(port: number, body: unknown, agent?: http.Agent): Promise<{ status: number; body: any; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      { hostname: '127.0.0.1', port, path: '/mcp', method: 'POST', agent,
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf-8');
          try { resolve({ status: res.statusCode!, headers: res.headers, body: JSON.parse(text) }); }
          catch { resolve({ status: res.statusCode!, headers: res.headers, body: text }); }
        });
      },
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

const initializeWithRoot = (root?: string) => ({
  jsonrpc: '2.0', id: 1, method: 'initialize',
  params: { protocolVersion: '2024-11-05', clientInfo: { name: 'agent', version: '1', ...(root ? { workspaceRoot: root } : {}) } },
});

const callIngest = (id: number, file: string, agent?: http.Agent) =>
  postMcpRaw(server.listeningPort!, { jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'mem_ingest_file', arguments: { file_path: file } } }, agent);

beforeAll(async () => {
  ensureTmpDir();
  fs.mkdirSync(path.join(SESSION_WS, 'docs'), { recursive: true });
  fs.mkdirSync(UNTRUSTED_WS, { recursive: true });
  fs.writeFileSync(path.join(SESSION_WS, 'docs', 'session-doc.txt'), 'session-bytes');
  fs.writeFileSync(path.join(TMP_DIR, 'legacy-doc.txt'), 'legacy-bytes');
  process.env.MCP_WORKSPACE_ROOT_PARENTS = PARENT;
  ({ server, deps } = createTestServer({
    outputChannel: { appendLine: (l: string) => logLines.push(l) } as any,
  }));
  deps.restGetToolsMock.tools.push({
    name: 'mem_ingest_file',
    description: 'Ingest a file into memory.',
    inputSchema: { type: 'object', properties: { file_path: { type: 'string' }, content_base64: { type: 'string', description: 'Base64 file content' } }, required: ['content_base64'] },
  } as any);
  await server.start(0);
  await postMcp(server.listeningPort!, { jsonrpc: '2.0', id: 0, method: 'tools/list', params: {} });
});

beforeEach(() => {
  deps.restCallToolMock.calls = [];
  deps.restCallToolMock.result = { content: [{ type: 'text', text: '{"ok":true}' }] };
});

afterAll(async () => {
  await server.stop();
  cleanTmpDir();
  if (envBackup === undefined) delete process.env.MCP_WORKSPACE_ROOT_PARENTS;
  else process.env.MCP_WORKSPACE_ROOT_PARENTS = envBackup;
});

describe('SA4E-406 A6 — session workspace binding (initialize → tools/call)', () => {
  // STC-style IT: bind under a configured parent → relative resolves under it
  it('binds a root under a configured parent; relative file_path resolves under it (rootSource session)', async () => {
    const agent = new http.Agent({ keepAlive: true }); // one client session
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); // F5 audit line
    try {
      const init = await postMcpRaw(server.listeningPort!, initializeWithRoot(SESSION_WS), agent);
      expect(init.body.result.workspaceRoot).toEqual({ bound: true, sessionId: expect.any(String) });
      expect(init.headers['mcp-session-id']).toBeTruthy();
      await callIngest(2, 'docs/session-doc.txt', agent);
      expect(deps.restCallToolMock.calls[0].args.file_path).toBe(path.join(SESSION_WS, 'docs', 'session-doc.txt'));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('rootSource=session'));
    } finally {
      agent.destroy();
      warn.mockRestore();
    }
    expect(logLines.join('\n')).toContain('(trust=parent)');
    expect(logLines.join('\n')).toContain('Session root bound:');
  });

  it('binds per CONNECTION when the client does not echo the session id', async () => {
    const agent = new http.Agent({ keepAlive: true }); // same socket, no header echo
    try {
      await postMcpRaw(server.listeningPort!, initializeWithRoot(SESSION_WS), agent);
      await callIngest(3, 'docs/session-doc.txt', agent);
      expect(deps.restCallToolMock.calls[0].args.file_path).toBe(path.join(SESSION_WS, 'docs', 'session-doc.txt'));
    } finally {
      agent.destroy();
    }
  });

  it('rejects a root under no parent/folder/allowlist; session unbound → legacy fallback', async () => {
    const init = await postMcpRaw(server.listeningPort!, initializeWithRoot(UNTRUSTED_WS), new http.Agent());
    expect(init.body.result.workspaceRoot).toEqual({ bound: false, error: expect.stringContaining('PATH_REJECTED_OUTSIDE_ALLOWLIST') });
    expect(init.headers['mcp-session-id']).toBeUndefined();
    await callIngest(4, 'legacy-doc.txt', new http.Agent()); // fresh connection → unbound
    expect(deps.restCallToolMock.calls[0].args.file_path).toBe(path.join(TMP_DIR, 'legacy-doc.txt'));
    expect(logLines.join('\n')).toContain('Session root REJECTED');
  });

  it('unset root ⇒ byte-identical legacy behaviour (no workspaceRoot field, no header)', async () => {
    const init = await postMcpRaw(server.listeningPort!, initializeWithRoot(), new http.Agent());
    expect(init.body.result.workspaceRoot).toBeUndefined();
    expect(init.headers['mcp-session-id']).toBeUndefined();
    expect(init.body.result.serverInfo.name).toBe('sdlc-agents-4-enterprise');
    fs.writeFileSync(path.join(TMP_DIR, 'unset-root-doc.txt'), 'legacy');
    await callIngest(5, 'unset-root-doc.txt', new http.Agent());
    expect(deps.restCallToolMock.calls[0].args.file_path).toBe(path.join(TMP_DIR, 'unset-root-doc.txt'));
  });

  it('unset root on a fresh server instance never binds (regression guard)', async () => {
    const { server: s2 } = createTestServer();
    try {
      await s2.start(0);
      const init = await postMcpRaw(s2.listeningPort!, initializeWithRoot(), new http.Agent());
      expect(Object.keys(init.body.result)).toEqual(['protocolVersion', 'capabilities', 'serverInfo']);
    } finally {
      await s2.stop();
    }
  });
});
