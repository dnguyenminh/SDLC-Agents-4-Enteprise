/**
 * SA4E-369 — peer bounds (TDD §8.2). The ONLY place these values may be tuned
 * (C-4). MAX_PINGPONG_TURNS is LOCKED (AC3); the rest are TDD-tunable internal
 * constants. No settings keys exist — zero-config by design (AC7, D5).
 */

/** Per-pair consecutive agent→agent turn cap (LOCKED — STATUS AC3). */
export const MAX_PINGPONG_TURNS = 5;

/** Per-tab inbound rate limit: max sends per rolling window. */
export const RATE_LIMIT_MAX = 10;

/** Rolling rate window length (ms). */
export const RATE_WINDOW_MS = 60_000;

/** Per-pair conversation thread bound (FIFO eviction on append). */
export const THREAD_MAX_ENTRIES = 50;

/** Blocking caller timeout (PEER_006 — caller-side only, task survives). */
export const BLOCKING_TIMEOUT_MS = 300_000;

/** Hard cap on the per-tab inbound FIFO queue (overflow → PEER_005). */
export const INBOUND_QUEUE_CAP = 20;

/** Terminal tasks are deleted after this retention (bounded store). */
export const POST_TERMINAL_RETENTION_MS = 60_000;

/** Per message size cap (v1.1 SEC-03/C2 — PEER_010, zero-state, pre-guard). */
export const PEER_MESSAGE_MAX_CHARS = 16_000;

/** S-02 (d): peer tool-approval UI window — auto-deny (fail-closed, TC-603).
 *  30s bounds the silent-stall surface the 120s default left open. */
export const PEER_APPROVAL_TIMEOUT_MS = 30_000;

/**
 * D4/AC7 — the 3 a2a session tools. MUST also be listed in the session
 * tool ALLOWLIST (session-host/loadout.ts): the pi-coding-agent SDK filters
 * customTools THROUGH the allowlist (AgentSession isAllowedTool), so a
 * customTool absent from the allowlist never reaches the model's tool pool.
 * This was the UAT root cause layer 2: the tools were wired as customTools
 * (all peer tests assert at that level) yet silently dropped for EVERY tab.
 */
export const PEER_TOOL_NAMES = ['peer_list', 'peer_send', 'peer_status'] as const;
