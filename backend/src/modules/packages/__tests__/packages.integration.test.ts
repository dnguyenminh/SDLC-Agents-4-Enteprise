import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { createPackagesRoutes } from '../routes/packages.js';

describe('Packages API Integration', () => {
  it('GET /api/packages/list returns 7 packages', async () => {
    const app = new Hono();
    app.route('/', createPackagesRoutes());
    const res = await app.request('/api/packages/list');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(7);
    expect(body.data[0].packageId).toBeDefined();
  });

  it('PATCH toggles package', async () => {
    const app = new Hono();
    app.route('/', createPackagesRoutes());
    const res = await app.request('/api/packages/pi-mcp-adapter', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.enabled).toBe(false);
  });
});
