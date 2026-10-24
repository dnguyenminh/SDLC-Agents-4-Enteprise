/**
 * SA4E-369 — the §6.2 dispatch loop: auto-run delivery + reply capture.
 * PeerBus delegates here on the NEXT tick after Tick-1 (setImmediate), so the
 * turn execution (governance, model calls — all await-heavy) never interleaves
 * the atomic send section. Registry is the SINGLE source of session-creation
 * inputs (SEC-08); the provenance envelope is stamped by the RECEIVING bus
 * from its own Registry (SEC-01/C1 L1 — anti-spoof).
 */
import { logger } from '../../logger.js';
import { wrapPeerPrompt, wrapPeerReply } from './envelope.js';
import { CURATED_FALLBACK_REASON, PEER_MESSAGES, peerError } from './errors.js';
import { normalizedPairKey } from './threads.js';
import type { PeerBus } from './bus.js';
import type { PeerRegistryEntry, PeerTask } from './types.js';

/** BR-6: at most ONE in-flight turn per tab; queued tasks drain FIFO. */
export async function dispatchPeerTurn(bus: PeerBus, tabId: string): Promise<void> {
  if (bus.isDisposed() || bus.isBusy(tabId)) return;
  const taskId = bus.dequeueForDispatch(tabId);
  if (!taskId) return;
  const peer = bus.entryOf(tabId);
  if (!peer) {
    bus.deps.tasks.cancelQueuedFor(tabId, (id) => peerError('PEER_009', PEER_MESSAGES.PEER_009(id)));
    return;
  }
  bus.markBusy(tabId, true);
  bus.deps.registry.setStatus(tabId, 'busy'); // busy BEFORE first token (§2.2.1)
  bus.deps.tasks.setRunning(taskId);
  try {
    await runTurn(bus, taskId, peer);
  } finally {
    bus.markBusy(tabId, false);
    bus.deps.registry.setStatus(tabId, 'idle');
    setImmediate(() => void dispatchPeerTurn(bus, tabId)); // drain FIFO (BR-6)
  }
}

/** AC5: peer prompt enters the SAME promptTurn API as user prompts. */
async function runTurn(bus: PeerBus, taskId: string, peer: PeerRegistryEntry): Promise<void> {
  const task = bus.deps.tasks.get(taskId);
  if (!task) return;
  bus.deps.registry.touchActivity(peer.tabId);
  try {
    const host = await bus.deps.gateway.ensureSessionHost(sessionRequest(bus, peer));
    const wrapped = wrapPeerPrompt(envelopeHeader(bus, task), task.message);
    const result = await host.promptTurn(wrapped, { turnOrigin: 'peer' });
    bus.deps.tasks.setCompleted(taskId, result.text);
    recordExchange(bus, task, result.text);
    // AC4: the receiving tab's transcript shows the auto-run turn's reply.
    bus.emit('peer:turn-settled', { tabId: peer.tabId, taskId, ok: true, text: result.text });
    logger.debug('peer turn completed', { taskId, toTabId: peer.tabId });
  } catch (err) {
    failTask(bus, taskId, peer.tabId, err);
  }
}

/** SEC-08: ALL session-creation inputs from ONE deep-copied registry entry. */
function sessionRequest(bus: PeerBus, peer: PeerRegistryEntry) {
  return {
    workspaceRoot: peer.workspaceRoot,
    providerId: peer.providerId,
    configuredModelId: peer.configuredModelId,
    role: peer.role,
    activeAgentId: peer.activeAgentId,
    tabId: peer.tabId,
    peerApprovalGate: bus.deps.approval,
  };
}

/** Header stamped from the RECEIVING bus's own Registry — never from content. */
function envelopeHeader(bus: PeerBus, task: PeerTask) {
  const sender = bus.entryOf(task.fromTabId);
  return {
    v: 1 as const,
    kind: 'peer-inbound' as const,
    fromTabId: task.fromTabId,
    fromAgentName: sender?.agentName ?? 'unknown', // sender may have closed mid-flight
    fromRole: sender?.role ?? 'unknown',
    taskId: task.taskId,
    sentAt: task.createdAt,
  };
}

/** AC5: governance rejection → PEER_007 (verbatim reason); other → PEER_003. */
function failTask(bus: PeerBus, taskId: string, tabId: string, err: unknown): void {
  const raw = err instanceof Error ? err.message : String(err);
  const reason = curateReason(raw);
  const error = isGovernanceRejection(raw)
    ? peerError('PEER_007', PEER_MESSAGES.PEER_007(tabId, reason), { tabId })
    : peerError('PEER_003', PEER_MESSAGES.PEER_003(tabId, reason), { tabId });
  // Fix 2 (SA4E-369 review): a one-shot failure event log has no duration —
  // Date.now() as `durationMs` was meaningless; it is a terminal timestamp.
  logger.warn('peer task failed', { taskId, code: error.code, tabId, endedAt: new Date().toISOString() });
  bus.deps.tasks.setFailed(taskId, error);
  recordFailureMarker(bus, taskId, tabId, error.code);
  // AC4: the receiving tab's transcript shows the failed turn (curated copy
  // only — the same error surface the sender sees, never raw internals).
  bus.emit('peer:turn-settled', { tabId, taskId, ok: false, error: { code: error.code, message: error.message } });
}

/** SEC-04: raw internals (paths, stacks) never cross tabs — curated surface. */
function curateReason(raw: string): string {
  const compact = raw.split('\n')[0] ?? '';
  const internal = compact.includes('/') || compact.includes('\\') || compact.length > 160
    || SECRET_PATTERNS.some((pattern) => pattern.test(compact)); // PEN-6a fix
  return internal ? CURATED_FALLBACK_REASON : compact;
}

/**
 * PEN-6a fix (SEC-04, review batch SA4E-369): credential-shaped text in a raw
 * error first line is exactly the same user, but it must never traverse tabs.
 * Any match ⇒ the whole reason degrades to CURATED_FALLBACK_REASON.
 * `token`-family words use word boundaries so benign governance copy
 * ("PI_BUDGET_EXCEEDED tokens 200000 > 150000") keeps its verbatim reason.
 */
const SECRET_PATTERNS: RegExp[] = [
  /sk-[A-Za-z0-9]{8,}/, // provider-style API keys ("sk-…")
  /api[\s_-]?key/i, // "api key", "api_key", "API-KEY", "apikey"
  /\btoken\b/i,
  /\bpassword\b/i,
  /\bbearer\b/i,
  /\bauthorization\b/i,
  /\bsecret\b/i,
  /[0-9a-fA-F]{32,}/, // hex material ≥32 chars (digests / hashed credentials)
];

/** Governance-shaped rejections carry allowlisted PI_* / governance prefixes. */
function isGovernanceRejection(raw: string): boolean {
  return raw.startsWith('PI_') || raw.includes('governance') || raw.includes('budget');
}

/** §5.4: the pair thread records the exchange (outbound prompt, inbound reply). */
function recordExchange(bus: PeerBus, task: PeerTask, reply: string): void {
  const key = normalizedPairKey(task.fromTabId, task.toTabId);
  bus.deps.threads.append(key, {
    direction: 'outbound', fromTabId: task.fromTabId, toTabId: task.toTabId,
    taskId: task.taskId, content: task.message, at: task.createdAt,
  });
  bus.deps.threads.append(key, {
    direction: 'inbound', fromTabId: task.toTabId, toTabId: task.fromTabId,
    taskId: task.taskId, content: wrapPeerReply(task.toTabId, reply), at: new Date().toISOString(), // S-05: untrusted frame in thread replay too
  });
}

function recordFailureMarker(bus: PeerBus, taskId: string, tabId: string, code: string): void {
  const task = bus.deps.tasks.get(taskId);
  if (!task) return;
  bus.deps.threads.append(normalizedPairKey(task.fromTabId, task.toTabId), {
    direction: 'inbound', fromTabId: tabId, toTabId: task.fromTabId,
    taskId, content: `[peer task failed: ${code}]`, at: new Date().toISOString(),
  });
}
