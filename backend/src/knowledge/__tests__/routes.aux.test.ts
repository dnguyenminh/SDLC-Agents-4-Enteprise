/**
 * SA4E-85 — Knowledge REST API route tests (Hono): events, artifacts, delete,
 * agents, jwtAuth wiring, rate limiter.
 * STC: #18 (404), #19 (jwtAuth wired), #23 (rate limit).
 * Split from routes.test.ts to keep each file under the CI line-count gate
 * (<=200 lines). No logic changed — tests only relocated.
 */

import { describe, it, expect } from 'vitest';
import { makeApp, wsHeaders, createThread } from './routes.helpers.js';
import { createProjectContext } from '../../modules/memory/ProjectContext.js';

describe('Knowledge REST API — /api/v1', () => {
  it('GET /threads/:id/events returns event sourcing log', async () => {
    const { app } = await makeApp();
    const { thread_id } = await createThread(app, 'ws-A');
    const res = await app.request(`/api/v1/threads/${thread_id}/events`, { headers: wsHeaders('ws-A') });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0].type).toBe('THREAD_CREATED');
  });

  it('GET /threads/:id/artifacts returns artifact store', async () => {
    const { app, service } = await makeApp();
    const { thread_id } = await createThread(app, 'ws-A');
    service.addArtifact(createProjectContext('ws-A', 'u'), thread_id, {
      type: 'diagram',
      name: 'architecture.png',
      content: { svg: '<svg/>' },
    });
    const res = await app.request(`/api/v1/threads/${thread_id}/artifacts`, { headers: wsHeaders('ws-A') });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('architecture.png');
  });

  it('DELETE /threads/:id removes the thread', async () => {
    const { app } = await makeApp();
    const { thread_id } = await createThread(app, 'ws-A');
    const delRes = await app.request(`/api/v1/threads/${thread_id}`, {
      method: 'DELETE',
      headers: wsHeaders('ws-A'),
    });
    expect(delRes.status).toBe(200);
    const getRes = await app.request(`/api/v1/threads/${thread_id}`, { headers: wsHeaders('ws-A') });
    expect(getRes.status).toBe(404);
  });

  it('DELETE /threads/:id from another workspace returns 404 (#18)', async () => {
    const { app } = await makeApp();
    const { thread_id } = await createThread(app, 'ws-A');
    const res = await app.request(`/api/v1/threads/${thread_id}`, {
      method: 'DELETE',
      headers: wsHeaders('ws-B'),
    });
    expect(res.status).toBe(404);
  });

  it('GET /agents returns registered agents', async () => {
    const { app, service } = await makeApp();
    service.upsertAgent({
      agent_id: 'dev-agent',
      name: 'Dev Agent',
      description: 'General dev agent',
      tools: ['bash', 'read_file'],
      mcp_servers: [],
      auto_approve: [],
    });
    const res = await app.request('/api/v1/agents', { headers: wsHeaders('ws-A') });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data).toHaveLength(1);
    expect(body.data[0].agent_id).toBe('dev-agent');
  });

  it('jwtAuth middleware is wired — anonymous mode resolves projectContext (#19)', async () => {
    const { app } = await makeApp();
    // No Authorization header: jwtAuth anonymous mode sets projectContext.
    // Without jwtAuth, c.get('projectContext') would be undefined → 500.
    const res = await app.request('/api/v1/threads', {
      headers: { 'Content-Type': 'application/json', 'X-Project-Id': 'ws-anon' },
    });
    expect(res.status).toBe(200);
  });

  it('rateLimiter is wired — headers present (#23)', async () => {
    const { app } = await makeApp();
    const res = await app.request('/api/v1/threads', { headers: wsHeaders('ws-A') });
    expect(res.status).toBe(200);
    expect(res.headers.get('X-RateLimit-Limit')).toBeTruthy();
  });
});
