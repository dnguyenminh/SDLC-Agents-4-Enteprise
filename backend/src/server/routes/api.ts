/**
 * Webview data API endpoints — /api/*
 * Provides data for Dashboard, KB Graph, Analytics, Tags, Quality panels.
 * Indexing write endpoints live in ./api-index.ts (SA4E-41 split for size + path-safety).
 * Implements: UC-5
 */

import { Hono } from 'hono';
import type { Logger } from 'pino';
import type { ModuleRegistry } from '../../modules/ModuleRegistry.js';
import { registerIndexRoutes } from './api-index.js';

export function createApiRoute(registry: ModuleRegistry, logger: Logger): Hono {
  const app = new Hono();

  // GET /api/dashboard/summary
  app.get('/api/dashboard/summary', (c) => {
    return c.json({
      data: { totalEntries: 0, recentCount: 0, topCategories: [] },
      timestamp: new Date().toISOString(),
    });
  });

  // GET /api/dashboard/recent
  app.get('/api/dashboard/recent', (c) => {
    return c.json({ data: { entries: [] }, timestamp: new Date().toISOString() });
  });

  // GET /api/kb/graph
  app.get('/api/kb/graph', (c) => {
    return c.json({ data: { nodes: [], edges: [] }, timestamp: new Date().toISOString() });
  });

  // GET /api/kb/graph/node/:id
  app.get('/api/kb/graph/node/:id', (c) => {
    const id = c.req.param('id');
    return c.json({ data: { id, title: '', content: '', tags: [] }, timestamp: new Date().toISOString() });
  });

  // GET /api/analytics/overview
  app.get('/api/analytics/overview', (c) => {
    return c.json({ data: { totalCalls: 0, avgResponseTime: 0, errorRate: 0 }, timestamp: new Date().toISOString() });
  });

  // GET /api/analytics/timeline
  app.get('/api/analytics/timeline', (c) => {
    return c.json({ data: { points: [] }, timestamp: new Date().toISOString() });
  });

  // GET /api/tags/list
  app.get('/api/tags/list', (c) => {
    return c.json({ data: { tags: [] }, timestamp: new Date().toISOString() });
  });

  // POST /api/tags
  app.post('/api/tags', async (c) => {
    const body = await c.req.json<{ name?: string }>();
    if (!body.name) {
      return c.json({ error: { code: 'INVALID_REQUEST', message: 'name is required' } }, 400);
    }
    return c.json({
      data: { id: crypto.randomUUID(), name: body.name, createdAt: new Date().toISOString() },
      timestamp: new Date().toISOString(),
    }, 201);
  });

  // PUT /api/tags/:id
  app.put('/api/tags/:id', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json<{ name?: string }>();
    return c.json({ data: { id, name: body.name, updatedAt: new Date().toISOString() }, timestamp: new Date().toISOString() });
  });

  // DELETE /api/tags/:id
  app.delete('/api/tags/:id', (c) => {
    return c.json({ data: { deleted: true }, timestamp: new Date().toISOString() });
  });

  // GET /api/quality/scores
  app.get('/api/quality/scores', (c) => {
    return c.json({ data: { scores: [] }, timestamp: new Date().toISOString() });
  });

  // GET /api/quality/summary
  app.get('/api/quality/summary', (c) => {
    return c.json({ data: { averageScore: 0, totalEntries: 0, distribution: {} }, timestamp: new Date().toISOString() });
  });

  // POST /api/index/* — source/document indexing (path-safe + tenant-scoped)
  registerIndexRoutes(app, registry, logger);

  return app;
}
