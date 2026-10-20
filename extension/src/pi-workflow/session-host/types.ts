/**
 * Public option/result types and the session governance decisions
 * (SA4E-355) for the PiAgentSessionHost.
 */
import type { NormalizedToolCall } from '../types/executor.types.js';
import type { PeerToolApprovalHandler, PeerTurnOrigin } from '../peer/types.js';
import { SMALL_CONTEXT_WINDOW_THRESHOLD } from '../../pi-agent/model-router.js';

export interface SessionHostOptions {
  workspaceRoot: string;
  providerId: string;
  apiKey?: string;
  baseUrl?: string;
  /** Raw configured model ('' / 'auto' allowed — resolved inside). */
  configuredModelId?: string;
  /**
   * SA4E-355 UC-02 (BR-07): pipeline role for scoped skills/steering.
   * Absent/unknown role fails open — nothing is filtered away.
   */
  role?: string;
  /** SA4E-355 UC-02: pipeline phase for steering scoping (unmapped phase → shared-* only). */
  phase?: string;
  /** SA4E-355 UC-01/BR-12: provider-detected context window (meta.n_ctx) when available. */
  nCtxDetected?: number;
  /** DI: prebuilt managers (tests use inMemory variants). */
  sessionManager?: unknown;
  settingsManager?: unknown;
  resourceLoader?: unknown;
  /**
   * SA4E-360 (§4.6): optional loopback MCP bridge for the skeleton supply +
   * read_method. Absent ⇒ DEGRADED_NO_SKELETON + INDEX_UNAVAILABLE steering
   * (fail-safe, never crash).
   */
  mcpBridge?: unknown;
  /** SA4E-370 S2: agent persona body injected as system prompt content. */
  personaBody?: string;
  /** SA4E-370 S2/S4: id of the agent driving this session (for history tagging + badge). */
  activeAgentId?: string;
  /**
   * SA4E-369: owning chat tab id (registry key workspaceRoot+tabId). Optional
   * here because the session-host registry requires it at its own boundary.
   */
  tabId?: string;
  /**
   * SA4E-369 SEC-01/C1 L3 (D6 Option A): fail-closed approval handler for
   * peer-triggered turns. Absent ⇒ peer-turn tool calls are blocked.
   */
  peerApprovalGate?: PeerToolApprovalHandler;
}

/**
 * SA4E-369 SEC-01/C1 L2: per-turn options — `turnOrigin` tags the executing
 * turn ('user' default keeps every existing caller unchanged, FR-10/AC8).
 */
export interface SessionTurnOptions {
  turnOrigin?: PeerTurnOrigin;
}

export interface SessionTurnResult {
  text: string;
  toolCalls: NormalizedToolCall[];
  sessionFile?: string;
}

export interface SessionHost {
  promptTurn(
    text: string,
    onToken?: (t: string) => void,
    onToolEvent?: (e: import('../pi-event-mapper.js').ToolLiveEvent) => void,
    onThinking?: (t: string) => void,
    opts?: SessionTurnOptions
  ): Promise<SessionTurnResult>;
  getSessionFile(): string | undefined;
  dispose(): void;
}

/**
 * SA4E-355 Task 6 (UC-06, OI-1): session behavior tier resolved from the
 * REAL nCtx (window-based primary — deterministic on the actual constraint,
 * not the model name). Applies the binary classifyTier rule
 * (nCtx <= SMALL_CONTEXT_WINDOW_THRESHOLD → small) onto the 3-tier behavior
 * scale from FSD §3.6.4: small ≤ 16,384; medium < 128,000; large ≥ 128,000.
 */
export type SessionTier = 'small' | 'medium' | 'large';

/** Large-tier floor (FSD §3.6.4: large ≥ 128k — no compression, full loadout). */
export const LARGE_CONTEXT_WINDOW_THRESHOLD = 128000;

/**
 * Resolves the behavior tier from the resolved nCtx.
 * Invalid windows fail safe to small (EF-1 UC-06: unknown → safe side).
 */
export function resolveSessionTier(nCtx: number): SessionTier {
  if (!Number.isFinite(nCtx) || nCtx <= 0) return 'small';
  if (nCtx <= SMALL_CONTEXT_WINDOW_THRESHOLD) return 'small';
  if (nCtx >= LARGE_CONTEXT_WINDOW_THRESHOLD) return 'large';
  return 'medium';
}

/**
 * BR-04 compression condition with Task 6 tier wiring: over-budget static OR
 * small tier (forced even on surplus); medium/large on surplus stay
 * byte-identical (Wave 2/3 behavior preserved).
 */
export function resolveShouldCompress(
  measuredStaticTokens: number,
  staticBudget: number,
  tier: SessionTier
): boolean {
  return measuredStaticTokens > staticBudget || tier === 'small';
}
