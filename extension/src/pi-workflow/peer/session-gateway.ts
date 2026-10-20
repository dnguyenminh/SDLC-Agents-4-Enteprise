/**
 * SA4E-369 — gateway adapter to the LANDED per-tab session host (D1, D1
 * consume-as-is per DISCREPANCY DISC-2: no session-factory modification).
 * Narrows the real SessionHost.promptTurn signature to the peer seam. The
 * import is function-time safe: both sides only call across the boundary at
 * runtime, never during module load.
 */
import { ensureSessionHost, evictSessionHost } from '../session-host/registry.js';
import type { PeerSessionGateway, PeerSessionRequest, PeerSessionTurnExecutor } from './types.js';

export const sessionHostGateway: PeerSessionGateway = {
  async ensureSessionHost(req: PeerSessionRequest): Promise<PeerSessionTurnExecutor> {
    const host = await ensureSessionHost(req);
    return {
      promptTurn: (text, opts) => host.promptTurn(text, undefined, undefined, undefined, opts),
    };
  },
  evictSessionHost(workspaceRoot: string, tabId: string): void {
    evictSessionHost(workspaceRoot, tabId);
  },
};
