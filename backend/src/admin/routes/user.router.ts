// KSA-286: User Router
import { Router } from 'express';
import { UserService } from '../services/user.service.js';

export function userRouter(deps: { db: any }): Router {
  const router = Router();
  const svc = new UserService(deps.db);

  router.get('/', (req, res) => {
    const page = parseInt(req.query.page as string) || 1;
    const size = Math.min(parseInt(req.query.size as string) || 20, 100);
    const result = svc.list({ status: req.query.status as string, search: req.query.search as string }, { page, size });
    res.json({ success: true, ...result });
  });

  router.post('/', async (req, res) => {
    try { const user = await svc.create(req.body); res.status(201).json({ success: true, data: user }); }
    catch (e: any) { res.status(400).json({ success: false, error: { code: e.code || 'VALIDATION_ERROR', message: e.message || 'Create failed' } }); }
  });

  router.patch('/:id/status', (req, res) => {
    try { const result = svc.updateStatus(req.params.id, req.body.status); res.json({ success: true, data: result }); }
    catch (e: any) { res.status(400).json({ success: false, error: { code: e.code, message: e.message } }); }
  });

  router.delete('/:id', (req, res) => {
    try { svc.delete(req.params.id); res.json({ success: true }); }
    catch (e: any) { const status = e.code === 'LAST_SYSTEM_OWNER' ? 403 : 404; res.status(status).json({ success: false, error: { code: e.code, message: e.message } }); }
  });

  router.post('/:id/force-logout', (req, res) => { res.json({ success: true, data: svc.forceLogout(req.params.id, req.body.sessionId) }); });

  router.post('/:id/reset-password', async (req, res) => {
    try { const result = await svc.resetPassword(req.params.id); res.json({ success: true, data: result }); }
    catch (err) { console.error('[user-router] reset-password failed:', err); res.status(400).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Reset failed' } }); }
  });

  return router;
}

