/**
 * SA4E-78 — Index scope + manager resolution.
 * Extracted from api-index-decoupled.ts: singleton IndexOperationManager per
 * CodeIntelModule and the single-source-of-truth tenant/workspace scope.
 */

import type { Context } from 'hono';
import * as fs from 'fs';
import * as path from 'path';
import type { ModuleRegistry } from '../../modules/ModuleRegistry.js';
import type { CodeIntelModule } from '../../modules/code-intel/CodeIntelModule.js';
import { IndexOperationManager } from '../../engine/indexer/index-operation-manager.js';
import { loadConfig } from '../../config/index.js';
import { requireProjectId } from '../../engine/query/code-intel-isolation.js';

/** Singleton manager map — one per CodeIntelModule lifetime. */
const managerCache = new WeakMap<object, IndexOperationManager>();

/**
 * Get or create the SINGLETON IndexOperationManager for the codeIntel module.
 * Exported so all index routes (source upload + full + progress) share ONE
 * manager instance — otherwise progress written by one route is invisible to
 * another (each manager only tracks its own operations), and each extra
 * instance leaks an `engine.on('progress')` listener.
 */
export function getManager(registry: ModuleRegistry): IndexOperationManager | null {
  const codeIntel = registry.getModule('codeIntel') as CodeIntelModule | undefined;
  if (!codeIntel || codeIntel.status !== 'ready') return null;
  const indexer = codeIntel.getIndexer();
  if (!indexer) return null;

  let manager = managerCache.get(codeIntel);
  if (!manager) {
    manager = new IndexOperationManager(indexer);
    managerCache.set(codeIntel, manager);
  }
  return manager;
}

/**
 * Resolve project scope from request headers (multi-tenant via JWT + X-Project-Id).
 * SINGLE SOURCE OF TRUTH for the index temp directory: both the source-upload
 * route (`/api/index/source`) and the index/progress routes MUST resolve the
 * same `{indexTempDir}/{userId}/{projectId}` so files are written to exactly the
 * directory that gets scanned, and progress is keyed by the same userId:projectId.
 * Exported for reuse by api-index.ts.
 */
export async function resolveScope(c: Context): Promise<{ userId: string; projectId: string; workspace: string; displayName?: string }> {
  const config = loadConfig();
  // Identity MUST come from the request (X-Project-Id / JWT projectContext). The backend
  // is multi-tenant and must never infer identity from its own config — missing identity
  // fails closed via requireProjectId (PROJECT_REQUIRED → 400), never silently defaulting
  // to the boot project (which would mis-scope or leak across tenants).
  const ctx = c.get('projectContext') as { userId?: string; projectId?: string } | undefined;
  const projectId = requireProjectId(c.req.header('X-Project-Id') || ctx?.projectId);
  // SINGLE SOURCE OF TRUTH for userId: the upload route (/api/index/source) derives
  // userId from validateSession(token) (requireAuth). The full-index/progress routes
  // MUST resolve the SAME userId, otherwise upload writes to {session.userId}/… while
  // the scan reads {ctx.userId||'default'}/… — a different (empty) dir → "Found 0 files".
  // Resolve from the session token first (matches upload), then ctx, then 'default'.
  const sessionUserId = await resolveSessionUserId(c);
  const userId = sessionUserId || ctx?.userId || 'default';
  // indexTempDir/{userId}/{projectId} — same dir for source file writes + scan.
  const workspace = path.join(config.indexTempDir, userId, projectId);
  if (!fs.existsSync(workspace)) fs.mkdirSync(workspace, { recursive: true });
  // The scan `workspace` above is a synthetic temp dir named after the projectId,
  // so its basename is NOT a usable display name. The client sends its REAL
  // workspace root via X-Workspace-Root — use that for project_registry.display_name.
  const workspaceRoot = c.req.header('X-Workspace-Root') || c.req.header('x-workspace-root');
  const displayName = workspaceRoot ? path.basename(workspaceRoot) : undefined;
  return { userId, projectId, workspace, displayName };
}

/**
 * Resolve userId from the Bearer session token — the SAME mechanism the upload
 * route uses (validateSession). Returns '' when no valid session, so callers can
 * fall back. This keeps upload and full-index on one identity source.
 */
async function resolveSessionUserId(c: Context): Promise<string> {
  const auth = c.req.header('Authorization') || '';
  const token = auth.replace('Bearer ', '').trim();
  if (!token) return '';
  try {
    const { validateSession } = await import('../../admin/db/sessions.js');
    const session = await validateSession(token);
    return session?.userId || '';
  } catch {
    return '';
  }
}
