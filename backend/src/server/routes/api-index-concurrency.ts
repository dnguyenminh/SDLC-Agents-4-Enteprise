/**
 * Index concurrency backpressure — extracted from api-index.ts (BR-18).
 * SA4E-99: Server-side backpressure — limit concurrent index requests.
 * indexLimit.maxConcurrent is a first-class admin config (hot-reloaded via
 * INDEX_LIMIT_CONFIG_CHANGED, persisted in config_changes) with the
 * INDEX_CONCURRENCY_LIMIT env as the startup default. The old hardcoded 3
 * starved sequential batch uploaders on cloud (high DB/disk latency holds
 * slots longer → 429 cascades). Default 3 preserves SA4E-99 behavior.
 */
import { bus, Events } from '../../shared/EventBus.js';

function resolveIndexConcurrencyDefault(): number {
  const parsed = parseInt(process.env.INDEX_CONCURRENCY_LIMIT || '3', 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 3;
}

let indexConcurrencyLimit = resolveIndexConcurrencyDefault();

/** Current max concurrent /api/index/source requests (admin-configurable). */
export function getIndexConcurrencyLimit(): number {
  return indexConcurrencyLimit;
}

/** Update the concurrency cap at runtime. Ignores non-integer values < 1. */
export function setIndexConcurrencyLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1) return;
  indexConcurrencyLimit = limit;
}

/**
 * Load the persisted indexLimit.maxConcurrent from the admin config store at
 * startup so an admin-saved value survives a restart. Non-blocking; falls back
 * to the env default when the DB/table is unavailable (rate-limiter.ts pattern).
 */
export async function loadPersistedIndexLimit(): Promise<void> {
  try {
    const { getDbAdapter } = await import('../../admin/db/core.js');
    const adapter = getDbAdapter();
    const row = await adapter.getAsync<{ new_value: string }>(
      "SELECT new_value FROM config_changes WHERE section = 'indexLimit' AND key = 'maxConcurrent' ORDER BY changed_at DESC LIMIT 1",
    );
    if (row?.new_value) setIndexConcurrencyLimit(parseInt(row.new_value, 10));
  } catch { /* config_changes table may not exist yet — keep env default */ }
}

// Hot-reload the cap when the admin saves an indexLimit config change (no restart).
bus.on<{ section: string; key: string; value: unknown }>(
  Events.INDEX_LIMIT_CONFIG_CHANGED,
  ({ key, value }) => {
    if (key !== 'maxConcurrent') return;
    const n = typeof value === 'string' ? Number(value) : value;
    if (typeof n === 'number') setIndexConcurrencyLimit(n);
  },
);
