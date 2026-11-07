/**
 * Stale-row GC for `mcp_tools` (SA4E-369 follow-up).
 *
 * Two recurring, idempotent prunes run beside tool ingestion each boot, where
 * the authoritative snapshots (registry tool names, registered child servers)
 * exist. Symmetric to the per-server `pruneRemoved` in the SA4E-42 repository:
 * the repository prunes "within" a server's rows on its connect events; this
 * module prunes rows whose owner disappeared silently (removed module /
 * removed server config). Guards mirror BR-04/06: an empty truth list never
 * wipes, an oversized list is skipped instead of risking bound-var failure.
 * These are data hygiene concerns, not one-shot migrations — the registry is
 * dynamic per workspace, so cleanup must re-run alongside ingestion.
 */
import type { DatabaseAdapter } from '../database/adapters/DatabaseAdapter.js';
import type { Logger } from 'pino';

/** Mirrors McpToolsRepository MAX_PRUNE_VARS: keep NOT IN lists bound-var safe. */
const MAX_PRUNE_VARS = 900;

/**
 * Delete core rows (server IS NULL) whose tool is no longer in the registry
 * snapshot (e.g. WebModule KSA-297 removed). Proxied rows are out of scope —
 * they belong to pruneOrphanProxyRows / the repository.
 */
export async function pruneStaleCoreRows(
  adapter: DatabaseAdapter,
  logger: Logger,
  coreNames: string[],
): Promise<void> {
  if (coreNames.length === 0) {
    logger.warn({ context: 'tool-ingestion' }, 'mcp_tools core prune skipped: empty core registry (no wipe)');
    return;
  }
  if (coreNames.length > MAX_PRUNE_VARS) {
    logger.warn(
      { context: 'tool-ingestion', coreNames: coreNames.length, max: MAX_PRUNE_VARS },
      'mcp_tools core prune skipped: oversized registry (bound-var safety)',
    );
    return;
  }
  const placeholders = coreNames.map(() => '?').join(', ');
  const result = await adapter.runAsync(
    `DELETE FROM mcp_tools WHERE server IS NULL AND name NOT IN (${placeholders})`,
    coreNames,
  );
  if (result.changes > 0) {
    logger.info(
      { context: 'tool-ingestion', prunedStale: result.changes },
      'mcp_tools: pruned stale core rows no longer in the registry',
    );
  }
}

/**
 * Delete proxied rows whose owning server is no longer registered (rows are
 * then un-executable: the reindex path can never refresh them and
 * execute_dynamic_tool always fails). `registeredServers` is the
 * getServersStatus() snapshot — a server registered but transiently down has
 * its rows KEPT (initializeAll registers state even on connect failure; the
 * health monitor retries; applyConnected refreshes rows on reconnect).
 */
export async function pruneOrphanProxyRows(
  adapter: DatabaseAdapter,
  logger: Logger,
  registeredServers: string[],
): Promise<void> {
  if (registeredServers.length === 0) {
    logger.warn({ context: 'tool-ingestion' }, 'mcp_tools proxy prune skipped: no registered servers (no wipe)');
    return;
  }
  if (registeredServers.length > MAX_PRUNE_VARS) {
    logger.warn(
      { context: 'tool-ingestion', servers: registeredServers.length, max: MAX_PRUNE_VARS },
      'mcp_tools proxy prune skipped: oversized server list (bound-var safety)',
    );
    return;
  }
  const placeholders = registeredServers.map(() => '?').join(', ');
  const result = await adapter.runAsync(
    `DELETE FROM mcp_tools WHERE server IS NOT NULL AND server NOT IN (${placeholders})`,
    registeredServers,
  );
  if (result.changes > 0) {
    logger.info(
      { context: 'tool-ingestion', prunedOrphan: result.changes },
      'mcp_tools: pruned orphan proxy rows (server no longer registered)',
    );
  }
}