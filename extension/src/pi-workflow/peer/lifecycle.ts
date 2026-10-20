/**
 * SA4E-369 Phase 5.7 S-01 — peer lifecycle wiring. The +39 diff in
 * chat-panel/conversation-manager.ts added the onTabCreated/onTabClosed
 * listeners, but no consumer existed at runtime: tab close never deregistered
 * (I-8 dead wire — zombie hosts) and a user message never reset the anti-loop
 * chain (BR-9 dead wire — pair locked at PEER_004 forever). This module is the
 * single wiring point the runtime lacked; it touches ONLY existing peer APIs
 * (register / handleTabClosed / notifyUserActivity) and never breaks the chat
 * flow (fail-safe: peer errors are swallowed here, chat keeps working).
 */
import { ensurePeerRuntimeForTab, peekPeerRuntime } from './runtime.js';
import type { PeerRegistryRegistration } from './types.js';

/** Structural source — ConversationManager satisfies this via its listeners. */
export interface PeerTabLifecycleSource {
  /** Subscribes a tab-opened listener; returns the unsubscribe function. */
  onTabCreated(listener: (tab: { id: string; name?: string }) => void): () => void;
  /** Subscribes a tab-closed listener; returns the unsubscribe function. */
  onTabClosed(listener: (tabId: string) => void): () => void;
}

export interface PeerTabLifecycleOptions {
  /** Workspace root stamped into the bootstrap registration (I-1 upgrades it). */
  resolveWorkspaceRoot?: () => string | undefined;
  /** DI seam (tests): registration primitive; default = runtime singleton. */
  register?: (meta: PeerRegistryRegistration & { tabId: string }) => void;
  /** DI seam (tests): close/cleanup primitive; default = runtime singleton. */
  close?: (tabId: string) => void;
  /** DI seam (tests): user-activity reset primitive; default = runtime singleton. */
  activity?: (tabId: string) => void;
}

/** Rebinding contract returned to the caller (BR-9 user message reset). */
export interface PeerLifecycleBinding {
  notifyUserActivity(tabId: string): void;
  dispose(): void;
}

/**
 * Wire type for the UI model (SA4E-369 S-01): any holder of an onTabCreated/
 * onTabClosed pair can bind via this — Class stays UI-pure (never imports
 * the peer runtime directly; the deliverable here is dependency-injected).
 */
export interface PeerTabLifecycleBinder {
  wiring: (source: PeerTabLifecycleSource) => unknown;
}

/** Registration meta for a tab with no session host yet — upgraded on first
 * real host creation (peer-approval.ts ensurePeerIdentity, I-1 idempotent). */
function bootstrapMeta(tabId: string, name: string, workspaceRoot: string | undefined): PeerRegistryRegistration & { tabId: string } {
  return {
    tabId,
    workspaceRoot: workspaceRoot ?? '',
    providerId: '',
    configuredModelId: '',
    activeAgentId: '',
    agentName: name,
    role: '',
    capabilities: [],
    model: 'auto',
    status: 'idle',
  };
}

/** (1) tab-opened → peer runtime ensured + registry identity registered (I-1). */
export function registerPeerTabIdentity(tabId: string, workspaceRoot?: string, agentName?: string): void {
  if (!tabId || tabId === 'default') return;
  try {
    ensurePeerRuntimeForTab(bootstrapMeta(tabId, agentName ?? tabId, workspaceRoot));
  } catch { /* registration must never break tab creation */ }
}

/** (2) tab-closed → bus.handleTabClosed — the I-8 SINGLE cleanup point. */
export function handlePeerTabClosed(tabId: string): void {
  if (!tabId || tabId === 'default') return;
  try {
    peekPeerRuntime()?.bus.handleTabClosed(tabId);
  } catch { /* cleanup must never break tab closing */ }
}

/** (3) BR-9: user message in a tab resets every pair chain the tab belongs to. */
export function notifyPeerUserActivity(tabId: string): void {
  if (!tabId) return;
  try {
    peekPeerRuntime()?.bus.notifyUserActivity(tabId);
  } catch { /* guard reset must never break the turn */ }
}

/** Wires a tab lifecycle source to the peer runtime (one call per source). */
export function wirePeerTabLifecycle(source: PeerTabLifecycleSource, opts: PeerTabLifecycleOptions = {}): PeerLifecycleBinding {
  const unsubs: Array<() => void> = [];
  unsubs.push(
    source.onTabCreated((tab) => {
      if (!tab?.id) return;
      if (opts.register) {
        try {
          opts.register(bootstrapMeta(tab.id, tab.name ?? tab.id, opts.resolveWorkspaceRoot?.()));
        } catch { /* registration must never break tab creation */ }
      } else {
        registerPeerTabIdentity(tab.id, opts.resolveWorkspaceRoot?.(), tab.name);
      }
    }),
    source.onTabClosed((tabId) => (opts.close ? tryClose(tabId, opts.close) : handlePeerTabClosed(tabId))),
  );
  return {
    notifyUserActivity: (tabId) => (opts.activity ? opts.activity(tabId) : notifyPeerUserActivity(tabId)),
    dispose: () => { for (const unsub of unsubs) unsub(); },
  };
}

function tryClose(tabId: string, close: (tabId: string) => void): void {
  if (!tabId || tabId === 'default') return;
  try {
    close(tabId);
  } catch { /* cleanup must never break tab closing */ }
}
