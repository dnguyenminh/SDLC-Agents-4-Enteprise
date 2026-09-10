/**
 * index-temp-dir.ts — SINGLE SOURCE OF TRUTH for the source/document write directory.
 *
 * Both the legacy indexing endpoints (`api-index.ts`) and the decoupled indexer
 * (`api-index-decoupled.ts`) must resolve the same base directory so that
 * configuring `indexTempDir` actually takes effect. Previously each site
 * resolved `KIRO_TEMP_DIR || <os.tmpdir>/kiro` independently, ignoring the
 * configured `indexTempDir` — the root cause of writes always landing in
 * `/tmp/kiro` regardless of configuration.
 */

import { loadConfig } from '../../config/index.js';
import { getLatestConfigValue } from '../../admin/admin-db.js';

/**
 * Resolve the base directory for source/document writes.
 *
 * Resolution order (highest priority first):
 *   1. DB-persisted `server.indexTempDir` (set via Admin UI) — runtime operator config
 *   2. env `CODE_INTEL_INDEX_TEMP_DIR` — boot-time override
 *   3. env `KIRO_TEMP_DIR` — legacy override (kept for backward compatibility)
 *   4. `config.indexTempDir` default (`<os.tmpdir>/CodeIntel`)
 *
 * @returns Absolute base directory under which per-tenant source/doc trees are written.
 */
export async function resolveIndexTempDir(): Promise<string> {
  // 1. DB-persisted admin config wins (may be unavailable during early boot → fall through)
  try {
    const persisted = await getLatestConfigValue('server', 'indexTempDir');
    if (persisted && persisted.trim()) return persisted.trim();
  } catch { /* DB not ready — fall through to env/default */ }
  // 2. explicit index temp dir env
  if (process.env.CODE_INTEL_INDEX_TEMP_DIR) return process.env.CODE_INTEL_INDEX_TEMP_DIR;
  // 3. legacy override
  if (process.env.KIRO_TEMP_DIR) return process.env.KIRO_TEMP_DIR;
  // 4. boot config default (<os.tmpdir>/CodeIntel)
  return loadConfig().indexTempDir;
}
