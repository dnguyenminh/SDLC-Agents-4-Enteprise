import type { WrapperServer } from "./wrapper-server";

/**
 * Registry of live WrapperServer instances keyed by port, stored on globalThis.
 * Survives in-process extension reloads (which re-evaluate this module and would
 * otherwise reset a module-level Map) so a stale instance still listening on its
 * port is stopped before a new instance binds — prevents EADDRINUSE on reload.
 * Module-level mutable state lives HERE and only here (single-owner rule).
 */
const ACTIVE_SERVERS_KEY = "__kiroWrapperActiveServers__";

export function getActiveServers(): Map<number, WrapperServer> {
  const g = globalThis as Record<string, unknown>;
  if (!g[ACTIVE_SERVERS_KEY]) {
    g[ACTIVE_SERVERS_KEY] = new Map<number, WrapperServer>();
  }
  return g[ACTIVE_SERVERS_KEY] as Map<number, WrapperServer>;
}
