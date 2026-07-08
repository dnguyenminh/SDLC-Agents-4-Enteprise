/**
 * Webview data API endpoints — /api/*
 * Provides data for Dashboard, KB Graph, Analytics, Tags, Quality panels.
 * Implements: UC-5
 */

import { Hono } from 'hono';
import type { Logger } from 'pino';
import * as fs from 'fs';
import * as path from 'path';
import type { ModuleRegistry } from '../../modules/ModuleRegistry.js';
import type { CodeIntelModule } from '../../modules/code-intel/CodeIntelModule.js';
import { loadConfig } from '../../config/BackendConfig.js';

/** Validate relative path - reject traversal attempts */
function isPathSafe(relPath: string): boolean {
  if (!relPath || typeof relPath !== 'string') return false;
  const normalized = path.normalize(relPath);
  // Reject: absolute paths, traversal, null bytes
  if (path.isAbsolute(normalized)) return false;
  if (normalized.startsWith('..') || normalized.includes('..')) return false;
  if (relPath.includes('\0')) return false;
  return true;
}

export function createApiRoute(registry: ModuleRegistry, logger: Logger): Hono {
  const app = new Hono();

  // GET /api/dashboard/summary
  app.get('/api/dashboard/summary', (c) => {
    return c.json({
      data: {
        totalEntries: 0,
        recentCount: 0,
        topCategories: [],
      },
      timestamp: new Date().toISOString(),
    });
  });

  // GET /api/dashboard/recent
  app.get('/api/dashboard/recent', (c) => {
    return c.json({
      data: { entries: [] },
      timestamp: new Date().toISOString(),
    });
  });

  // GET /api/kb/graph
  app.get('/api/kb/graph', (c) => {
    return c.json({
      data: { nodes: [], edges: [] },
      timestamp: new Date().toISOString(),
    });
  });

  // GET /api/kb/graph/node/:id
  app.get('/api/kb/graph/node/:id', (c) => {
    const id = c.req.param('id');
    return c.json({
      data: { id, title: '', content: '', tags: [] },
      timestamp: new Date().toISOString(),
    });
  });

  // GET /api/analytics/overview
  app.get('/api/analytics/overview', (c) => {
    return c.json({
      data: { totalCalls: 0, avgResponseTime: 0, errorRate: 0 },
      timestamp: new Date().toISOString(),
    });
  });

  // GET /api/analytics/timeline
  app.get('/api/analytics/timeline', (c) => {
    return c.json({
      data: { points: [] },
      timestamp: new Date().toISOString(),
    });
  });

  // GET /api/tags/list
  app.get('/api/tags/list', (c) => {
    return c.json({
      data: { tags: [] },
      timestamp: new Date().toISOString(),
    });
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
    return c.json({
      data: { id, name: body.name, updatedAt: new Date().toISOString() },
      timestamp: new Date().toISOString(),
    });
  });

  // DELETE /api/tags/:id
  app.delete('/api/tags/:id', (c) => {
    return c.json({ data: { deleted: true }, timestamp: new Date().toISOString() });
  });

  // GET /api/quality/scores
  app.get('/api/quality/scores', (c) => {
    return c.json({
      data: { scores: [] },
      timestamp: new Date().toISOString(),
    });
  });

  // GET /api/quality/summary
  app.get('/api/quality/summary', (c) => {
    return c.json({
      data: { averageScore: 0, totalEntries: 0, distribution: {} },
      timestamp: new Date().toISOString(),
    });
  });

  // POST /api/index/source
  app.post('/api/index/source', async (c) => {
    try {
      const { files } = await c.req.json<{ files: Array<{ path: string; content: string }> }>();
      if (!files || !Array.isArray(files)) {
        return c.json({ error: 'files array required' }, 400);
      }
      
      const config = loadConfig();
      const workspace = config.workspace;

      // Phase 1: Write all files to disk (critical for remote indexing)
      let written = 0;
      for (const file of files) {
        const targetPath = path.join(workspace, file.path);
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, file.content, 'utf-8');
        written++;
      }

      // Phase 2: Trigger full re-index asynchronously (non-blocking)
      // This avoids tree-sitter WASM "table index is out of bounds" crash
      // that occurs when indexSingleFile is called rapidly per-file.
      const codeIntelModule = registry.getModule('codeIntel') as CodeIntelModule | undefined;
      const indexer = codeIntelModule?.getIndexer();
      if (indexer) {
        // Fire-and-forget: run full index in background after all files are written
        indexer.runFullIndex().catch((err: any) => {
          logger.error({ err }, 'Background full re-index failed');
        });
      }
      
      return c.json({ written, reindexTriggered: !!indexer });
    } catch (err: any) {
      logger.error({ err }, 'Error writing source batch');
      return c.json({ error: 'Internal error' }, 500);
    }
  });

  // POST /api/index/document
  app.post('/api/index/document', async (c) => {
    try {
      const { path: relPath, content } = await c.req.json<{ path: string; content: string }>();
      if (!relPath || !content) {
        return c.json({ error: 'path and content required' }, 400);
      }
      
      const config = loadConfig();
      const workspace = config.workspace;
      const targetPath = path.join(workspace, relPath);
      
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, content, 'utf-8');
      
      return c.json({ success: true });
    } catch (err: any) {
      logger.error({ err }, 'Error writing document');
      return c.json({ error: 'Internal error' }, 500);
    }
  });

  // POST /api/index/documents
  app.post('/api/index/documents', async (c) => {
    try {
      const { files } = await c.req.json<{ files: Array<{ path: string; content: string }> }>();
      if (!files || !Array.isArray(files)) {
        return c.json({ error: 'files array required' }, 400);
      }
      
      const config = loadConfig();
      const workspace = config.workspace;

      for (const file of files) {
        const targetPath = path.join(workspace, file.path);
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, file.content, 'utf-8');
      }
      
      return c.json({ indexed: files.length });
    } catch (err: any) {
      logger.error({ err }, 'Error writing documents batch');
      return c.json({ error: 'Internal error' }, 500);
    }
  });

  return app;
}
