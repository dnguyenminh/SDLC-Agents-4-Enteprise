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

/** Forwards every peer approval-pending event to the webview approval bar. */
export function wirePeerApprovalBridge(sendToWebview: SendToWebview): void {
  try {
    onPeerApprovalPending((event) => {
      sendToWebview({
        type: "chat:toolApprovalPending",
        toolId: event.toolUseId,
        toolName: event.toolName,
        peer: true,
      } as ChatExtToWebviewMessage);
    });
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
