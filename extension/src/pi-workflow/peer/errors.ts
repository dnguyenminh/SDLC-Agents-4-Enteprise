/**
 * SA4E-369 — PeerError factory + descriptive message templates (FSD §9.1).
 * Messages travel in the pi-a2a envelope shape (error.code + error.message, D4).
 * Never includes peer message/reply content (§7.3).
 */
import type { PeerError, PeerErrorCode } from './types.js';

/** Builds a PeerError — the ONLY way peer errors are constructed. */
export function peerError(code: PeerErrorCode, message: string, details?: Record<string, unknown>): PeerError {
  return details ? { code, message, details } : { code, message };
}

/** Formats numbers with group separators (en-US) for stable error copy, e.g. 16001 -> "16,001". */
const fmt = (n: number): string => n.toLocaleString('en-US');

/** Descriptive message templates, one per error code (TDD §5.8 matrix). */
export const PEER_MESSAGES = {
  PEER_001: (tabId: string): string =>
    `Peer tab ${tabId} is not available. Open the target tab and retry.`,
  PEER_002: (): string => 'Cannot send a peer task to the same tab.',
  PEER_003: (tabId: string, reason: string): string => `Peer task failed in ${tabId}: ${reason}`,
  PEER_004: (pair: string, cap: number): string =>
    `Anti-loop guard: ping-pong cap (${cap}) reached for pair ${pair}. Send a message in either tab to continue.`,
  PEER_005_RATE: (tabId: string): string =>
    `Rate limit: tab ${tabId} received too many peer tasks in the last 60s. Retry shortly.`,
  PEER_005_QUEUE: (tabId: string, cap: number): string =>
    `Peer inbox for tab ${tabId} is full (${cap} queued). Retry shortly.`,
  PEER_006: (taskId: string): string =>
    `Peer task ${taskId} did not complete in time. It may still finish — check with peer_status.`,
  PEER_007: (tabId: string, reason: string): string =>
    `Peer task rejected by context governance in ${tabId}: ${reason}`,
  PEER_008: (taskId: string): string => `Unknown peer task ${taskId}.`,
  PEER_009: (taskId: string): string => `Peer task ${taskId} cancelled: target tab closed.`,
  PEER_010: (length: number, max: number): string =>
    `Peer message is too large (${fmt(length)} > ${fmt(max)} characters). Split the message and resend.`,
  TEARDOWN: (): string => 'Extension host shutting down; peer task state discarded (BR-12).',
} as const;

/** SEC-04: internal-looking raw errors never cross tabs — this is the fallback. */
export const CURATED_FALLBACK_REASON = 'session turn failed (details in local log)';
