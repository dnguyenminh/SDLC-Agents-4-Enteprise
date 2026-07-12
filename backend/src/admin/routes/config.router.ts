// KSA-286: Config Router
import { Router } from 'express';
import { ConfigService } from '../services/config.service.js';

export function configRouter(deps: { db: any }): Router {
  const router = Router();
  const svc = new ConfigService(deps.db);

  router.get('/', (req, res) => {
    const sections = (req as unknown as { userPermissions: { permissionId: string; roleData: { sections?: string[] } }[] }).userPermissions?.find((p: { permissionId: string }) => p.permissionId === 'CONFIG_EDIT')?.roleData?.sections;
    res.json({ success: true, data: { sections: svc.getAll(sections) } });
  });

  router.patch('/:section/:key', (req, res) => {
    try { const result = svc.update(req.params.section, req.params.key, req.body.value, (req as unknown as { userId: string }).userId); res.json({ success: true, data: result }); }
    catch (e: any) { res.status(400).json({ success: false, error: { code: e.code, message: e.message } }); }
  });

  router.get('/history', (_req, res) => { res.json({ success: true, data: { history: svc.getHistory() } }); });

  return router;
}

