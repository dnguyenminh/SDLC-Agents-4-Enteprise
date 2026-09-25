// KSA-286: MCP Admin Router
import { Router } from 'express';
import { MCPAdminService } from '../services/mcp-admin.service.js';

export function mcpAdminRouter(deps: { mcpOrchestrator: any }): Router {
  const router = Router();
  const svc = new MCPAdminService(deps.mcpOrchestrator);

  router.get('/servers', (_req, res) => { res.json({ success: true, data: { servers: svc.listServers() } }); });

  router.get('/servers/:id', (req, res) => {
    const server = svc.getServer(req.params.id);
    if (!server) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Server not found' } }); return; }
    res.json({ success: true, data: server });
  });

  router.post('/servers/:id/restart', async (req, res) => {
    try { const result = await svc.restart(req.params.id); res.json({ success: true, data: result }); }
    catch (e: any) { res.status(500).json({ success: false, error: { code: e.code, message: e.message } }); }
  });

  router.patch('/servers/:id/tools/:tool', (req, res) => {
    svc.toggleTool(req.params.id, req.params.tool, req.body.enabled);
    res.json({ success: true });
  });

  router.get('/servers/:id/logs', (req, res) => {
    const lines = parseInt(req.query.lines as string) || 200;
    res.json({ success: true, data: { logs: svc.getLogs(req.params.id, lines) } });
  });

  return router;
}

