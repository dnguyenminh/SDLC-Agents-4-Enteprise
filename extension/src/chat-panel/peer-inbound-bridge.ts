/**
 * SA4E-369 AC4 — routes the peer runtime's inbound/turn-settled events into
 * the RECEIVING tab's webview (badge + `[Peer inbound]` transcript prefix row
 * + reply row). Before this bridge the events were emitted on the bus but
 * nobody subscribed — the receiving tab looked completely idle during a peer
 * exchange while its agent was actually auto-running the task (live UAT
 * 2026-10-24: "tab nhận không có gì cả").
 *
 * Same single-slot pattern as peer-approval-bridge (one live subscription,
 * latest panel wins, a dead view never breaks the runtime).
 */
import type { ChatExtToWebviewMessage } from "./message-protocol";
import { onPeerInbound, onPeerTurnSettled } from "../pi-workflow/peer/runtime";

type SendToWebview = (msg: ChatExtToWebviewMessage) => void;

/** Handlers already wired — guards repeat registrations across handler builds. */
const wired = new WeakSet<SendToWebview>();
/** Single-slot subscriptions: at most ONE runtime listener per event at any time. */
let activeInbound: { unsub: () => void } | undefined;
let activeSettled: { unsub: () => void } | undefined;

export function wirePeerInboundBridge(sendToWebview: SendToWebview): void {
  if (wired.has(sendToWebview)) return;
  wired.add(sendToWebview);
  try {
    activeInbound?.unsub(); // latest panel wins — never more than one subscription
    activeSettled?.unsub();
    const unsubInbound = onPeerInbound((event) => {
      try {
        sendToWebview({
          type: "chat:peerInbound",
          tabId: event.tabId,
          fromTabId: event.fromTabId,
          fromAgentName: event.agentName,
          taskId: event.taskId,
          preview: event.preview,
        } as ChatExtToWebviewMessage);
      } catch { /* a dead panel view must never break the runtime */ }
    });
    const unsubSettled = onPeerTurnSettled((event) => {
      try {
        sendToWebview({
          type: "chat:peerTurnSettled",
          tabId: event.tabId,
          taskId: event.taskId,
          ok: event.ok,
          text: event.text,
          error: event.error,
        } as ChatExtToWebviewMessage);
      } catch { /* a dead panel view must never break the runtime */ }
    });
    activeInbound = { unsub: unsubInbound };
    activeSettled = { unsub: unsubSettled };
  } catch { /* peer UI must never break the handler construction */ }
}
