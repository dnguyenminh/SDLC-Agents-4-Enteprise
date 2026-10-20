/**
 * SA4E-215 — Route integration tests (decisions + mcp-servers endpoints).
 * No live server required — routes are exercised through Hono's app.request().
 * Split from sa4e-215.routes.test.ts to keep each file under the CI
 * line-count gate (<=200 lines). No logic changed — tests only relocated.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { setupSa4e215, PROJECT, PROJECT_2, type Sa4e215Ctx } from './sa4e-215.helpers.js';

let json: Sa4e215Ctx['json'];
let authHeaders: Sa4e215Ctx['authHeaders'];

beforeAll(async () => {
  const ctx = await setupSa4e215();
  json = ctx.json;
  authHeaders = ctx.authHeaders;
});

describe('DECISIONS', () => {
  it('rejects without token -> ERR_002 (401)', async () => {
    const res = await json('POST', '/decisions', { ruleSetId: 'default', result: 'approved' });
    expect(res.status).toBe(401);
    expect((await res.json() as any).error.code).toBe('ERR_002');
  });

  it('create requires ruleSetId+result -> ERR_001 (400)', async () => {
    const res = await json('POST', '/decisions', { result: 'approved' }, await authHeaders());
    expect(res.status).toBe(400);
    expect((await res.json() as any).error.code).toBe('ERR_001');
  });

  it('create success returns decisionId and echoes input (same input -> same output)', async () => {
    const payload = { ruleSetId: 'default', result: 'approved', inputParams: { risk: 30 }, confidence: 0.7, projectId: PROJECT };
    const res = await json('POST', '/decisions', payload, await authHeaders());
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.decisionId).toMatch(/^dec-/);
    expect(body.data.result).toBe('approved');
    expect(body.data.ruleSetId).toBe('default');
    expect(body.data.confidence).toBe(0.7);
    // re-run identical payload -> same mapped output shape, success true
    const res2 = await json('POST', '/decisions', payload, await authHeaders());
    const body2 = (await res2.json()) as any;
    expect(body2.success).toBe(true);
    expect(body2.data.result).toBe('approved');
  });

  it('list filters by projectId', async () => {
    await json('POST', '/decisions', { ruleSetId: 'default', result: 'rejected', projectId: PROJECT }, await authHeaders());
    const res = await json('GET', `/decisions?projectId=${PROJECT}`, undefined, await authHeaders());
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.every((d: any) => d.projectId === PROJECT)).toBe(true);
  });

  it('read one returns the record', async () => {
    const created = await json('POST', '/decisions', { ruleSetId: 'default', result: 'approved', projectId: PROJECT }, await authHeaders());
    const id = (await created.json() as any).data.decisionId;
    const res = await json('GET', `/decisions/${id}`, undefined, await authHeaders());
    expect(res.status).toBe(200);
    expect((await res.json() as any).data.decisionId).toBe(id);
  });

  it('read unknown -> ERR_006 (404)', async () => {
    const res = await json('GET', '/decisions/dec-nonexistent', undefined, await authHeaders());
    expect(res.status).toBe(404);
    expect((await res.json() as any).error.code).toBe('ERR_006');
  });
});

describe('MCP SERVERS', () => {
  it('rejects without token -> ERR_002 (401)', async () => {
    const res = await json('POST', '/mcp/servers', { projectId: PROJECT, name: 'x', transportType: 'stdio' });
    expect(res.status).toBe(401);
    expect((await res.json() as any).error.code).toBe('ERR_002');
  });

  it('create requires projectId/name/transportType -> ERR_001 (400)', async () => {
    const res = await json('POST', '/mcp/servers', { name: 'x' }, await authHeaders());
    expect(res.status).toBe(400);
    expect((await res.json() as any).error.code).toBe('ERR_001');
  });

  it('create with unknown project_id -> ERR_006 (400)', async () => {
    const res = await json('POST', '/mcp/servers', { projectId: 'prj-does-not-exist', name: 'x', transportType: 'stdio' }, await authHeaders());
    expect(res.status).toBe(400);
    expect((await res.json() as any).error.code).toBe('ERR_006');
  });

  it('create success returns serverId', async () => {
    const res = await json('POST', '/mcp/servers', { projectId: PROJECT, name: 'github', transportType: 'stdio', command: 'npx', args: {}, env: {} }, await authHeaders());
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.serverId).toMatch(/^mcp-/);
    expect(body.data.transportType).toBe('stdio');
  });

  it('list by projectId', async () => {
    const res = await json('GET', `/mcp/servers?projectId=${PROJECT}`, undefined, await authHeaders());
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.every((s: any) => s.projectId === PROJECT)).toBe(true);
  });

  it('duplicate name per project -> ERR_001 (400)', async () => {
    await json('POST', '/mcp/servers', { projectId: PROJECT, name: 'dup', transportType: 'stdio' }, await authHeaders());
    const res = await json('POST', '/mcp/servers', { projectId: PROJECT, name: 'dup', transportType: 'stdio' }, await authHeaders());
    expect(res.status).toBe(400);
    expect((await res.json() as any).error.code).toBe('ERR_001');
  });

  it('same name allowed for a different project', async () => {
    const a = await json('POST', '/mcp/servers', { projectId: PROJECT, name: 'shared', transportType: 'stdio' }, await authHeaders());
    expect(a.status).toBe(200);
    const b = await json('POST', '/mcp/servers', { projectId: PROJECT_2, name: 'shared', transportType: 'stdio' }, await authHeaders());
    expect(b.status).toBe(200);
    expect((await b.json() as any).data.serverId).toMatch(/^mcp-/);
  });

  it('update sets disabled', async () => {
    const created = await json('POST', '/mcp/servers', { projectId: PROJECT, name: 'toupdate', transportType: 'stdio' }, await authHeaders());
    const id = (await created.json() as any).data.serverId;
    const res = await json('PUT', `/mcp/servers/${id}`, { disabled: true }, await authHeaders());
    expect(res.status).toBe(200);
    expect((await res.json() as any).data.disabled).toBe(true);
  });

  it('delete is hard delete, then read -> ERR_006 (404)', async () => {
    const created = await json('POST', '/mcp/servers', { projectId: PROJECT, name: 'todelete', transportType: 'stdio' }, await authHeaders());
    const id = (await created.json() as any).data.serverId;
    const del = await json('DELETE', `/mcp/servers/${id}`, undefined, await authHeaders());
    expect(del.status).toBe(200);
    const res = await json('GET', `/mcp/servers/${id}`, undefined, await authHeaders());
    expect(res.status).toBe(404);
    expect((await res.json() as any).error.code).toBe('ERR_006');
  });
});
