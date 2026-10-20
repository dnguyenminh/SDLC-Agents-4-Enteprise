/**
 * Admin route tests — KB import conflicts (STORY 2) + KB entry detail (STORY 3).
 * Split from admin.test.ts to keep each file under the CI line-count gate
 * (<=200 lines). No logic changed — tests only relocated.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { Hono } from 'hono';
import { setupAdmin } from './admin.helpers.js';

let app: Hono;
let authHeaders: () => Record<string, string>;

beforeAll(async () => {
  const ctx = await setupAdmin();
  app = ctx.app;
  authHeaders = ctx.authHeaders;
});

// ===== STORY 2: KB Import Conflict Resolution =====
describe('Admin Routes — KB Import Conflict Resolution (STORY 2)', () => {
  it('POST /api/admin/kb/import with conflictMode=skip returns conflict info', async () => {
    const res = await app.request('/api/admin/kb/import', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        entries: [
          { id: 'new-entry-1', source: 'test', content: 'New content' },
          { id: 'new-entry-2', source: 'test2', content: 'More content' },
        ],
        conflictMode: 'skip',
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body).toHaveProperty('imported');
    expect(body).toHaveProperty('skipped');
    expect(body).toHaveProperty('overwritten');
    expect(body).toHaveProperty('merged');
    expect(body).toHaveProperty('conflicts');
    expect(body).toHaveProperty('message');
  });

  it('POST /api/admin/kb/import with conflictMode=overwrite accepted', async () => {
    const res = await app.request('/api/admin/kb/import', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        entries: [{ id: 'entry-x', source: 'x', content: 'x' }],
        conflictMode: 'overwrite',
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
  });

  it('POST /api/admin/kb/import with conflictMode=merge accepted', async () => {
    const res = await app.request('/api/admin/kb/import', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        entries: [{ id: 'entry-y', source: 'y', content: 'y' }],
        conflictMode: 'merge',
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
  });

  it('POST /api/admin/kb/import with invalid conflictMode returns 400', async () => {
    const res = await app.request('/api/admin/kb/import', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        entries: [{ id: 'e1', content: 'test' }],
        conflictMode: 'invalid',
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toContain('conflictMode');
  });
});

// ===== STORY 3: KB Graph Node Click → Detail Panel =====
describe('Admin Routes — KB Entry Detail (STORY 3)', () => {
  it('GET /api/admin/kb/entries/:id returns entry details or 404', async () => {
    // First get any entry from the list
    const listRes = await app.request('/api/admin/kb/entries?pageSize=1', { headers: authHeaders() });
    const listBody = await listRes.json() as any;

    if (listBody.entries && listBody.entries.length > 0) {
      const entryId = listBody.entries[0].id || listBody.entries[0].entry_id;
      const res = await app.request(`/api/admin/kb/entries/${entryId}`, { headers: authHeaders() });
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('title');
      expect(body).toHaveProperty('content');
      expect(body).toHaveProperty('tier');
      expect(body).toHaveProperty('tags');
      expect(body).toHaveProperty('links');
    } else {
      // No entries in DB — 404 is expected
      const res = await app.request('/api/admin/kb/entries/nonexistent-id', { headers: authHeaders() });
      expect(res.status).toBe(404);
    }
  });

  it('GET /api/admin/kb/entries/:id returns 404 for nonexistent entry', async () => {
    const res = await app.request('/api/admin/kb/entries/definitely-not-real-id-xyz', { headers: authHeaders() });
    expect(res.status).toBe(404);
    const body = await res.json() as any;
    expect(body.error).toBe('Entry not found');
  });
});
