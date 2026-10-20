/**
 * SA4E-85 — Knowledge REST API route tests (Hono): threads + checkpoints.
 * Exercises real KnowledgeService + in-memory SQLite through the Hono app.
 * STC: PBT-HYD-01 (create→UUID), IT-HYD-03 (checkpoint roundtrip), #18 (404),
 *      #23 (rate limit + body cap).
 * Split from routes.test.ts to keep each file under the CI line-count gate
 * (<=200 lines). No logic changed — tests only relocated.
 */

import { describe, it, expect } from 'vitest';
import { makeApp, wsHeaders, createThread } from './routes.helpers.js';
import { UUID_V4_REGEX } from '../models.js';

describe('Knowledge REST API — /api/v1', () => {
  it('POST /threads returns 201 with UUID v4 thread_id (PBT-HYD-01)', async () => {
    const { app } = await makeApp();
    const { status, thread_id } = await createThread(app, 'ws-A');
    expect(status).toBe(201);
    expect(thread_id).toMatch(UUID_V4_REGEX);
  });

  it('POST /threads with non-object body returns 400', async () => {
    const { app } = await makeApp();
    const res = await app.request('/api/v1/threads', {
      method: 'POST',
      headers: wsHeaders('ws-A'),
      body: JSON.stringify([1, 2, 3]),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('INVALID_REQUEST');
  });

  it('GET /threads lists only caller workspace threads', async () => {
    const { app } = await makeApp();
    await createThread(app, 'ws-A');
    await createThread(app, 'ws-B');
    const res = await app.request('/api/v1/threads', { headers: wsHeaders('ws-A') });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data).toHaveLength(1);
    expect(body.data[0].workspace_id).toBe('ws-A');
  });

  it('GET /threads/:id from another workspace returns 404, not 403 (#18)', async () => {
    const { app } = await makeApp();
    const { thread_id } = await createThread(app, 'ws-A');
    const res = await app.request(`/api/v1/threads/${thread_id}`, { headers: wsHeaders('ws-B') });
    expect(res.status).toBe(404);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('THREAD_NOT_FOUND');
  });

  it('GET /threads/:id/messages from another workspace returns 404 (#18)', async () => {
    const { app } = await makeApp();
    const { thread_id } = await createThread(app, 'ws-A');
    const res = await app.request(`/api/v1/threads/${thread_id}/messages`, { headers: wsHeaders('ws-B') });
    expect(res.status).toBe(404);
  });

  it('PUT then GET checkpoint roundtrip (IT-HYD-03)', async () => {
    const { app } = await makeApp();
    const { thread_id } = await createThread(app, 'ws-A');
    const payload = {
      checkpoint: { v: 3, channel_values: { messages: [{ role: 'user', content: 'persisted' }] } },
      metadata: { source: 'remote-checkpointer' },
      pendingWrites: [{ task_id: 't1', channel: 'state', value: 'ok' }],
      messages: [{ id: 'm1', role: 'user', content: 'persisted message' }],
    };
    const putRes = await app.request(`/api/v1/threads/${thread_id}/checkpoint`, {
      method: 'PUT',
      headers: wsHeaders('ws-A'),
      body: JSON.stringify(payload),
    });
    expect(putRes.status).toBe(200);
    const putBody = (await putRes.json()) as any;
    expect(putBody.data.checkpoint).toEqual(payload.checkpoint);
    expect(putBody.data.metadata).toEqual(payload.metadata);

    const getRes = await app.request(`/api/v1/threads/${thread_id}/checkpoint`, { headers: wsHeaders('ws-A') });
    expect(getRes.status).toBe(200);
    const getBody = (await getRes.json()) as any;
    expect(getBody.data.checkpoint).toEqual(payload.checkpoint);
    expect(getBody.data.pending_writes).toEqual(payload.pendingWrites);

    const msgRes = await app.request(`/api/v1/threads/${thread_id}/messages`, { headers: wsHeaders('ws-A') });
    const msgBody = (await msgRes.json()) as any;
    expect(msgBody.data).toHaveLength(1);
    expect(msgBody.data[0].content).toBe('persisted message');
  });

  it('PUT checkpoint for a thread in another workspace returns 404 (#18)', async () => {
    const { app } = await makeApp();
    const { thread_id } = await createThread(app, 'ws-A');
    const res = await app.request(`/api/v1/threads/${thread_id}/checkpoint`, {
      method: 'PUT',
      headers: wsHeaders('ws-B'),
      body: JSON.stringify({ checkpoint: { v: 1 } }),
    });
    expect(res.status).toBe(404);
  });

  it('PUT checkpoint auto-creates a thread for a never-seen UUID (LangGraph checkpointer)', async () => {
    const { app } = await makeApp();
    const freshId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const res = await app.request(`/api/v1/threads/${freshId}/checkpoint`, {
      method: 'PUT',
      headers: wsHeaders('ws-A'),
      body: JSON.stringify({ checkpoint: { v: 1, channel_values: { ticketKey: 'X-1' } } }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data.thread_id).toBe(freshId);
    expect(body.data.version).toBe(1);

    const getRes = await app.request(`/api/v1/threads/${freshId}/checkpoint`, { headers: wsHeaders('ws-A') });
    expect(getRes.status).toBe(200);
    const getBody = (await getRes.json()) as any;
    expect(getBody.data.checkpoint.channel_values.ticketKey).toBe('X-1');

    const listRes = await app.request('/api/v1/threads', { headers: wsHeaders('ws-A') });
    const listBody = (await listRes.json()) as any;
    expect(listBody.data.some((t: { thread_id: string }) => t.thread_id === freshId)).toBe(true);
  });

  it('PUT checkpoint over body limit returns 413 (#23)', async () => {
    const { app } = await makeApp(1024); // tiny limit for fast test
    const { thread_id } = await createThread(app, 'ws-A');
    const bigBody = JSON.stringify({ checkpoint: { blob: 'x'.repeat(5000) } });
    const res = await app.request(`/api/v1/threads/${thread_id}/checkpoint`, {
      method: 'PUT',
      headers: wsHeaders('ws-A'),
      body: bigBody,
    });
    expect(res.status).toBe(413);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});
