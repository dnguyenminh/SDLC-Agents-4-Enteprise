// KSA-286: KB Admin Router
import { Router } from 'express';
import { KBAdminService } from '../services/kb-admin.service.js';

export function kbAdminRouter(deps: { db: any; kbEngine: any }): Router {
  const router = Router();
  const svc = new KBAdminService(deps.db, deps.kbEngine);

  router.get('/entries', (req, res) => {
    const page = parseInt(req.query.page as string) || 1;
    const size = Math.min(parseInt(req.query.size as string) || 20, 100);
    const result = svc.listEntries({ tier: req.query.tier as string, tags: req.query.tags as string, search: req.query.search as string }, { page, size });
    res.json({ success: true, ...result });
  });

  router.post('/entries/:id/links', (req, res) => {
    try { svc.createLink(req.params.id, req.body.targetEntryId, req.body.linkType); res.status(201).json({ success: true }); }
    catch (e: any) { const s = e.code === 'CIRCULAR_LINK' ? 409 : 400; res.status(s).json({ success: false, error: { code: e.code, message: e.message } }); }
  });

  router.delete('/entries/:id/links/:targetId', (req, res) => { svc.removeLink(req.params.id, req.params.targetId); res.json({ success: true }); });

  router.patch('/entries/:id/tags', (req, res) => {
    try { svc.updateTags(req.params.id, req.body.tags); res.json({ success: true }); }
    catch (e: any) { res.status(400).json({ success: false, error: { code: e.code, message: e.message } }); }
  });

  router.get('/promotion', (_req, res) => { res.json({ success: true, data: { promotions: svc.listPromotions() } }); });

  router.post('/promotion/review', (req, res) => {
    try { svc.reviewPromotion(req.body, (req as any).userId); res.json({ success: true }); }
    catch (e: any) { res.status(400).json({ success: false, error: { code: e.code, message: e.message } }); }
  });

  router.get('/graph', (req, res) => {
    const data = svc.getGraphData({ tier: req.query.tier as string, minQuality: parseInt(req.query.minQuality as string) || undefined, limit: parseInt(req.query.limit as string) || 500, projectId: req.query.projectId as string });
    res.json({ success: true, data });
  });

  return router;
}

