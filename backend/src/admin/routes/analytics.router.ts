// KSA-286: Analytics Router — overview + embeddings stats

import { Router } from 'express';
import { AdminModuleDependencies } from '../index.js';
import { apiSuccess } from './helpers.js';

export function createAnalyticsRouter(deps: AdminModuleDependencies): Router {
  const router = Router();
  const { db, kbEngine } = deps;

  // GET /api/admin/analytics/overview
  router.get('/overview', (_req, res) => {
    try {
      // Entry counts per tier
      const kbCounts = kbEngine?.getEntryCounts?.() || { user: 0, project: 0, shared: 0 };

      // Audit stats (last 7 days)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const auditStats = db.prepare(
        `SELECT action, COUNT(*) as count FROM audit_entries WHERE timestamp >= ? GROUP BY action ORDER BY count DESC LIMIT 10`
      ).all(sevenDaysAgo) as Record<string, unknown>[];

      // User stats
      const userStats = db.prepare(
        `SELECT status, COUNT(*) as count FROM users GROUP BY status`
      ).all() as Record<string, unknown>[];

      // Search volume (last 7 days from audit)
      const searchCount = (db.prepare(
        `SELECT COUNT(*) as cnt FROM audit_entries WHERE action LIKE '%SEARCH%' AND timestamp >= ?`
      ).get(sevenDaysAgo) as { cnt: number } | undefined)?.cnt || 0;

      res.json(apiSuccess({
        kbEntries: kbCounts,
        topActions: auditStats.map((r: any) => ({ action: r.action, count: r.count })),
        usersByStatus: userStats.map((r: any) => ({ status: r.status, count: r.count })),
        searchVolume7d: searchCount,
      }));
    } catch (e: any) {
      res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: e?.message || 'Analytics failed' } });
    }
  });

  // GET /api/admin/analytics/embeddings
  router.get('/embeddings', (_req, res) => {
    try {
      const stats = kbEngine?.getEmbeddingStats?.() || {
        totalVectors: 0,
        dimensions: 0,
        avgScore: 0,
        tierDistribution: {},
      };
      res.json(apiSuccess(stats));
    } catch (e: any) {
      res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: e?.message || 'Embedding stats failed' } });
    }
  });

  return router;
}
