/**
 * SA4E-369 Phase 5.7 S-02 — routes the PEER runtime approval gate through the
 * SAME webview approval loop the legacy engine gate already has (Fix J:
 * chat:toolApprovalPending → Approve/Reject bar → chat:toolApproval). Before
 * this bridge a peer turn's pending approval was an orphan 30s auto-deny the
 * user never saw. Fail-closed semantics are unchanged: no resolution ⇒ deny.
 */
import type { ChatExtToWebviewMessage } from "./message-protocol";
import { getPeerApprovalGate, onPeerApprovalPending } from "../pi-workflow/peer/runtime";

type SendToWebview = (msg: ChatExtToWebviewMessage) => void;

/** Handlers already wired — guards repeat registrations across handler builds. */
const wired = new WeakSet<SendToWebview>();
/** Single-slot subscription: at most ONE runtime listener at any time. */
let active: { unsub: () => void } | undefined;

/**
 * Forwards every peer approval-pending event to the webview approval bar.
 * Fix (review batch SA4E-369, message-handler L39 duplicate listeners): each
 * panel used to stack its own runtime listener — N panels (or N handler
 * rebuilds) registered N callbacks and listeners accumulated for closed
 * panels. Now a once-per-handler WeakSet guard plus single-slot replacement:
 * a new wire unsubscribes the previous one, so registration never repeats and
 * nothing accumulates. Fail-closed semantics are unchanged — no resolution
 * on the runtime gate ⇒ auto-deny, regardless of which panel is wired.
 */
export function wirePeerApprovalBridge(sendToWebview: SendToWebview): void {
  if (wired.has(sendToWebview)) return;
  wired.add(sendToWebview);
  try {
    active?.unsub(); // latest panel wins — never more than one subscription
    const unsub = onPeerApprovalPending((event) => {
      try {
        sendToWebview({
          type: "chat:toolApprovalPending",
          toolId: event.toolUseId,
          toolName: event.toolName,
          peer: true,
        } as ChatExtToWebviewMessage);
      } catch { /* a dead panel view must never break the runtime */ }
    });
    active = { unsub };
  } catch { /* approval UI must never break the handler construction */ }
}

/**
 * Resolves a pending approval on the PEER gate. Returns true when the peer
 * gate owned the toolId (handled here) — the legacy engine gate stays the
 * untouched fallback path. Peer decisions never feed the auto-approve pattern
 * matcher (D6: EVERY peer tool call needs explicit human approval).
 */
export function tryResolvePeerApproval(toolId: string, decision: "approve" | "reject"): boolean {
  try {
    const gate = getPeerApprovalGate();
    if (!gate.hasPending(toolId)) return false;
    gate.resolveApproval(toolId, decision);
    return true;
  } catch {
    return false; // not ours to resolve — let the legacy gate path run
  }
}
