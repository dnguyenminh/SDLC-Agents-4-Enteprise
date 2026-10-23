/**
 * SA4E-369 — gateway adapter to the LANDED per-tab session host (D1, D1
 * consume-as-is per DISCREPANCY DISC-2: no session-factory modification).
 * Narrows the real SessionHost.promptTurn signature to the peer seam. The
 * import is function-time safe: both sides only call across the boundary at
 * runtime, never during module load.
 *
 * SA4E-369 UAT layer-3 fix: the registry entry (SEC-08) carries per-TAB
 * identity but NEVER credentials/provider-URLs (process-wide state). The
 * gateway seam therefore merges the captured provider context — the SAME
 * SessionHostOptions fields the user path passes — into every request, so a
 * peer turn dispatching to a tab with no cached host creates the host exactly
 * like a user turn would (keyless gateway + credentials + bridge).
 */
import { ensureSessionHost, evictSessionHost } from '../session-host/registry.js';
import type { PeerProviderContext, PeerSessionGateway, PeerSessionRequest, PeerSessionTurnExecutor } from './types.js';

/** Captured at the FIRST host creation (wirePeerSession) — first-winner. */
let providerContext: PeerProviderContext | undefined;

/** First-winner capture (I-1): the first host creation pins the provider context. */
export function setSessionHostGatewayContext(context: PeerProviderContext): void {
  if (providerContext) return;
  providerContext = context;
}

/** Test hook — nothing survives between suites (I-9). */
export function resetSessionHostGatewayContext(): void {
  providerContext = undefined;
}

/**
 * Identity (registry) wins; provider fields fill in from the captured
 * context. `configuredModelId`/`providerId` fall back to the context too —
 * the registry rows seeded from `ensurePeerIdentity` defaults ('' / 'auto')
 * must not override the working provider context with emptiness.
 */
function withProviderContext(req: PeerSessionRequest): PeerSessionRequest {
  const ctx = providerContext;
  if (!ctx) return req;
  return {
    ...req,
    baseUrl: req.baseUrl ?? ctx.baseUrl,
    apiKey: req.apiKey ?? ctx.apiKey,
    mcpBridge: req.mcpBridge ?? ctx.mcpBridge,
    nCtxDetected: req.nCtxDetected ?? ctx.nCtxDetected,
    providerId: req.providerId || ctx.providerId || req.providerId,
    configuredModelId: req.configuredModelId || ctx.configuredModelId || req.configuredModelId,
  };
}

export const sessionHostGateway: PeerSessionGateway = {
  async ensureSessionHost(req: PeerSessionRequest): Promise<PeerSessionTurnExecutor> {
    const host = await ensureSessionHost(withProviderContext(req));
    return {
      promptTurn: (text, opts) => host.promptTurn(text, undefined, undefined, undefined, opts),
    };
  },
  evictSessionHost(workspaceRoot: string, tabId: string): void {
    evictSessionHost(workspaceRoot, tabId);
  },
};
