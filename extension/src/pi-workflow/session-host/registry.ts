/**
 * Session-host registry — the ONE home of the per-workspace host cache
 * (SA4E-334/336). Cached per workspaceRoot; 30s ensure timeout so turns
 * never hang.
 */
import { createHost } from './create-host.js';
import type { SessionHost, SessionHostOptions } from './types.js';

const hosts = new Map<string, Promise<SessionHost>>();

/** Cached per workspaceRoot; 30s ensure timeout so turns never hang. */
export function ensureSessionHost(opts: SessionHostOptions): Promise<SessionHost> {
  const key = opts.workspaceRoot || '(default)';
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

/** Test hook. */
export function clearSessionHostCache(): void {
  hosts.clear();
}
