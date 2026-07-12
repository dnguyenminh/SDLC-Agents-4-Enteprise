/**
 * Admin Portal routes — /admin (SPA) + /api/admin/* (API)
 * Features: Real JWT auth, persistent RBAC (SQLite), full User CRUD.
 * All on same port as MCP backend (48721).
 *
 * Refactored: delegates to admin/ module (see admin/index.ts)
 */
export { createAdminRoute } from './admin/index.js';
