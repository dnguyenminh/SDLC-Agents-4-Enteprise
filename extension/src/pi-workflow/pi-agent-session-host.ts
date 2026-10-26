/**
 * PiAgentSessionHost facade (SA4E-334/355/360).
 * Implementation: ./session-host/ (types, governance, model-resolution,
 * overrides, loadout, turn-executor, create-host, registry).
 * The per-workspace host cache lives ONLY in ./session-host/registry.ts.
 */
export type {
  SessionHostOptions,
  SessionTurnResult,
  SessionTier,
} from './session-host/types.js';
export {
  LARGE_CONTEXT_WINDOW_THRESHOLD,
  resolveSessionTier,
  resolveShouldCompress,
} from './session-host/types.js';
export { getSessionToolLoadout } from './session-host/loadout.js';
export {
  ensureSessionHost,
  clearSessionHostCache,
  abortSessionHost,
} from './session-host/registry.js';
