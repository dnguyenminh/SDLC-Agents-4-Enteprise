// KSA-286: RBAC Router
import { Router } from 'express';
import { RBACService } from '../services/rbac.service.js';

export function rbacRouter(deps: { db: any }): Router {
  const router = Router();
  const svc = new RBACService(deps.db);

  router.get('/groups', (_req, res) => { res.json({ success: true, data: { groups: svc.listGroups() } }); });
  router.get('/permissions', (_req, res) => { res.json({ success: true, data: { permissions: svc.listPermissions() } }); });

  router.post('/groups', (req, res) => {
    try { const group = svc.createGroup(req.body.accessGroupName, req.body.permissions || []); res.status(201).json({ success: true, data: group }); }
    catch (e: any) { res.status(400).json({ success: false, error: { code: e.code, message: e.message } }); }
  });

  router.put('/groups/:id', (req, res) => {
    try { svc.updateGroup(req.params.id, req.body.accessGroupName, req.body.permissions || []); res.json({ success: true }); }
    catch (e: any) { res.status(400).json({ success: false, error: { code: e.code, message: e.message } }); }
  });

  router.delete('/groups/:id', (req, res) => {
    try { svc.deleteGroup(req.params.id); res.json({ success: true }); }
    catch (e: any) { const s = e.code === 'GROUP_HAS_USERS' ? 409 : 400; res.status(s).json({ success: false, error: { code: e.code, message: e.message } }); }
  });

  // --- Roles API ---

  router.get('/groups/:groupId/permissions/:permId/roles', (req, res) => {
    const roles = svc.listRoles(req.params.groupId, req.params.permId);
    res.json({ success: true, data: { roles } });
  });

  router.post('/groups/:groupId/permissions/:permId/roles', (req, res) => {
    try {
      const role = svc.createRole(req.params.groupId, req.params.permId, req.body.roleName, req.body.roleData);
      res.status(201).json({ success: true, data: role });
    } catch (e: any) { res.status(400).json({ success: false, error: { code: e.code, message: e.message } }); }
  });

  router.put('/roles/:roleId', (req, res) => {
    try { svc.updateRole(req.params.roleId, req.body.roleName, req.body.roleData); res.json({ success: true }); }
    catch (e: any) { res.status(400).json({ success: false, error: { code: e.code, message: e.message } }); }
  });

  router.delete('/roles/:roleId', (req, res) => {
    try { svc.deleteRole(req.params.roleId); res.json({ success: true }); }
    catch (e: any) { res.status(400).json({ success: false, error: { code: e.code, message: e.message } }); }
  });

  return router;
}

