// KSA-286: Dashboard Router
import { Router } from 'express';
import { DashboardService } from '../services/dashboard.service.js';

export function dashboardRouter(deps: { db: any; mcpOrchestrator: any }): Router {
  const router = Router();
  const svc = new DashboardService(deps.db, deps.mcpOrchestrator);

  router.get('/health', (_req, res) => { res.json({ success: true, data: svc.getHealth() }); });
  router.get('/activity', (req, res) => { const limit = parseInt(req.query.limit as string) || 20; res.json({ success: true, data: { activities: svc.getActivity(limit) } }); });

  return router;
}

