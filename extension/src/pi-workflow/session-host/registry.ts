/**
 * Session-host registry — the ONE home of the per-tab host cache (SA4E-334/336,
 * SA4E-370 S3). Cached per workspaceRoot+tabId; 30s ensure timeout so turns
 * never hang. Per-tab isolation: each tab gets its own AgentSession with
 * independent history, token accounting, and compaction (BR-05, F01).
 */
import { createHost } from './create-host.js';
import type { SessionHost, SessionHostOptions } from './types.js';

const hosts = new Map<string, Promise<SessionHost>>();

/** Composite registry key: workspaceRoot + tabId (never "default"). */
export function sessionKey(workspaceRoot: string, tabId: string): string {
  return `${workspaceRoot}+${tabId}`;
}

/** Rejects tabId="default" — every tab must have a real identifier (BR-S3-02, TC-409). */
function validateTabId(tabId: string): void {
  if (!tabId || tabId === "default") {
    throw new Error(`PI_INVALID_TAB_ID: tabId must not be "default" or empty, got: '${tabId}'`);
  }
}

/** Cached per workspaceRoot+tabId; 30s ensure timeout so turns never hang. */
export function ensureSessionHost(opts: SessionHostOptions & { tabId: string }): Promise<SessionHost> {
  validateTabId(opts.tabId);
  const key = sessionKey(opts.workspaceRoot || '(default)', opts.tabId);
  const hit = hosts.get(key);
  if (hit) return hit;
  const job = Promise.race([
    createHost(opts),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('PI_SESSION_TIMEOUT: AgentSession ensure >30s')), 30_000)
    ),
  ]);
  hosts.set(key, job);
  job.catch(() => {
    if (hosts.get(key) === job) hosts.delete(key);
  });
  return job;
}

/** Evict a cached session host for a tab (used on agent switch / tab close). */
export function evictSessionHost(workspaceRoot: string, tabId: string): void {
  validateTabId(tabId);
  const key = sessionKey(workspaceRoot || '(default)', tabId);
  hosts.delete(key);
}

/** Test hook. */
export function clearSessionHostCache(): void {
  hosts.clear();
}
