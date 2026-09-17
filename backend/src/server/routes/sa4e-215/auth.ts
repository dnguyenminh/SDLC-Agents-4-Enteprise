/**
 * SA4E-215 — Authentication routes (aligned to real sa4e_db).
 *
 * Uses platform primitives (NOT Prisma/argon2):
 *  - getDbAdapter()        : unified async DatabaseAdapter (SQLite/PostgreSQL)
 *  - hashPassword/verifyPassword : PBKDF2 salt:hash (sha512)
 *  - createSession/validateSession/invalidateSession : session tokens
 *  - recordAudit           : writes to real audit_log table
 *  - getUserPermissions    : group-based RBAC
 *
 * Mounted at /api/sa4e-215/auth (via sa4e-215/index.ts).
 * Delegates to unified auth routes for single code path.
 */
import { createUnifiedAuthRoutes } from '../auth/unified.js';

export function createSa4e215AuthRoutes(): Hono {
  return createUnifiedAuthRoutes();
}
