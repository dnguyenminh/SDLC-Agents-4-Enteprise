/**
 * SA4E-369 — peer module types. Single source of truth for all peer_* shapes
 * (TDD §4.2, "separate models" rule). Everything here is in-memory only
 * (BR-12, D5): no persistence, no network (AC7).
 */
import type { SessionTurnOptions } from '../session-host/types.js';

export type PeerStatus = 'idle' | 'busy';

/** SEC-01/C1 L2 — origin tag of the turn executing a prompt. */
export type PeerTurnOrigin = 'user' | 'peer';

/** Shared mutable cell carrying the CURRENT turn's origin (read by the gate). */
export interface TurnOriginTracker {
  current: PeerTurnOrigin;
}

export interface PeerRegistryEntry {
  tabId: string; // UUID v4; never 'default' (BR-2)
  workspaceRoot: string; // D1: part of session key workspaceRoot+tabId
  providerId: string; // v1.1 SEC-08: session-creation inputs live ON the registry
  configuredModelId: string;
  activeAgentId: string;
  agentName: string;
  role: string;
  capabilities: string[];
  model: string;
  status: PeerStatus; // busy set BEFORE first token; idle after terminal capture
  registeredAt: string; // ISO 8601
  lastActivityAt: string; // ISO 8601; updated on each inbound turn start
}

/** register() input — lifecycle timestamps are owned by the registry. */
export type PeerRegistryRegistration = Omit<
  PeerRegistryEntry,
  'tabId' | 'registeredAt' | 'lastActivityAt'
>;

/** peer_list() row (deep-copied snapshot + self flag). */
export interface PeerInfo {
  tabId: string;
  agentName: string;
  role: string;
  capabilities: string[];
  model: string;
  status: PeerStatus;
  self: boolean;
}

export type PeerErrorCode =
  | 'PEER_001'
  | 'PEER_002'
  | 'PEER_003'
  | 'PEER_004'
  | 'PEER_005'
  | 'PEER_006'
  | 'PEER_007'
  | 'PEER_008'
  | 'PEER_009'
  | 'PEER_010';

export interface PeerError {
  code: PeerErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export type PeerTaskState = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type PeerTaskMode = 'blocking' | 'async';
/** Terminal set is exactly {completed, failed, cancelled} (AC2, I-7). */
export type PeerTaskTerminalState = 'completed' | 'failed' | 'cancelled';

export interface PeerTask {
  taskId: string; // 't-' + UUID v4
  fromTabId: string;
  toTabId: string; // ≠ fromTabId; exists in registry at creation
  message: string;
  mode: PeerTaskMode;
  state: PeerTaskState;
  /** v1.1 SEC-01/C1 L2 — audit tag distinguishing peer-triggered turns. */
  turnOrigin?: PeerTurnOrigin;
  reply?: string; // set on completed
  error?: PeerError; // set on failed/cancelled
  createdAt: string;
  startedAt?: string; // set on queued→running
  completedAt?: string; // set on any terminal transition
}

export type PeerMessageDirection = 'inbound' | 'outbound';

export interface PeerMessage {
  direction: PeerMessageDirection;
  fromTabId: string;
  toTabId: string;
  taskId?: string;
  content: string; // in-memory only (BR-12)
  at: string; // ISO 8601
}

export interface PeerThread {
  threadKey: string; // normalized unordered pair: sorted 'tabA|tabB'
  maxEntries: number; // THREAD_MAX_ENTRIES = 50
  messages: PeerMessage[]; // FIFO — evict from front when length > maxEntries
}

export interface PairGuardState {
  pairKey: string;
  pingpongTurns: number; // consecutive agent→agent turns; cap MAX_PINGPONG_TURNS = 5
  lastOrigin: 'agent' | 'user';
}

/** peer_send result envelope (pi-a2a a2a_call-compatible shape, D4). */
export interface SendResult {
  taskId: string;
  state: PeerTaskState;
  reply?: string;
  error?: PeerError;
}

/** peer_status result — deep-copied, side-effect free (UC-3 AF-1). */
export interface PeerStatusResult {
  taskId: string;
  state: PeerTaskState;
  reply?: string;
  fromTabId: string;
  toTabId: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  turnOrigin?: PeerTurnOrigin;
  error?: PeerError;
}

export interface PeerListResult {
  peers: PeerInfo[];
}

/** pi-a2a-shaped error envelope (D4 §3.5) — error.code + error.message. */
export interface PeerErrorEnvelope {
  error: PeerError;
}

/** Payload of the bus event `peer:inbound` (UI badge/transcript attribution). */
export interface PeerInboundEvent {
  tabId: string;
  fromTabId: string;
  taskId: string;
  agentName: string;
}

/**
 * Guard verdict — `commit()` applies the counter updates in the SAME tick as
 * evaluate (I-2). The bus calls commit() only after every later rejection
 * point (queue cap) passed, so rejected sends leave zero state (I-7).
 */
export type GuardVerdict =
  | { pass: true; commit: () => void }
  | { pass: false; error: PeerError };

/**
 * Turn executor surface the bus needs from the session host (D1 consume-as-is,
 * §6.2). The gateway narrows the real SessionHost.promptTurn signature.
 */
export interface PeerSessionTurnExecutor {
  promptTurn(text: string, opts?: SessionTurnOptions): Promise<{ text: string }>;
}

/** Session-creation request built from ONE registry entry (SEC-08). */
export interface PeerSessionRequest {
  workspaceRoot: string;
  providerId: string;
  configuredModelId: string;
  role: string;
  activeAgentId: string;
  tabId: string;
  peerApprovalGate?: PeerToolApprovalHandler;
}

/** Transport seam (D4): the ONLY session integration the peer module needs. */
export interface PeerSessionGateway {
  ensureSessionHost(req: PeerSessionRequest): Promise<PeerSessionTurnExecutor>;
  evictSessionHost(workspaceRoot: string, tabId: string): void;
}

export interface PeerToolApprovalRequest {
  toolUseId: string;
  toolName: string;
  input: Record<string, unknown>;
  /** Receiving tab id — stamped by the create-host extension. */
  tabId?: string;
}

/** Fail-closed approval handler for peer turns (D6 Option A, §7.6 L3). */
export interface PeerToolApprovalHandler {
  requestApproval(req: PeerToolApprovalRequest): Promise<{ approved: boolean; reason?: string }>;
}
