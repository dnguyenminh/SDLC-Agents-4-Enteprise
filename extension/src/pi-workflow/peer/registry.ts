/**
 * SA4E-369 — PeerRegistry (D3, SEC-08): the single source of truth for tab
 * identity + session-creation inputs. In-memory Map only (BR-12); no locks
 * (C-6 single-threaded host). Invariants: I-1 idempotent register, I-3
 * update-then-emit, I-4 deep-copy snapshots.
 */
import type {
  PeerInfo,
  PeerRegistryEntry,
  PeerRegistryRegistration,
  PeerStatus,
} from './types.js';

export class PeerRegistry {
  private readonly entries = new Map<string, PeerRegistryEntry>();
  /** Wired by PeerBus — fired AFTER the Map mutation (I-3). */
  onRegistered?: (entry: PeerRegistryEntry) => void;
  onDeregistered?: (tabId: string) => void;

  /**
   * I-1: re-register on the same id is an idempotent update in place — no
   * duplicate `registered` event. Returns the stored (deep-copied) entry.
   */
  register(tabId: string, info: PeerRegistryRegistration): PeerRegistryEntry {
    const existing = this.entries.get(tabId);
    if (existing) {
      Object.assign(existing, structuredClone(info), {
        tabId,
        registeredAt: existing.registeredAt,
        lastActivityAt: existing.lastActivityAt,
      });
      return structuredClone(existing);
    }
    const now = new Date().toISOString();
    const entry: PeerRegistryEntry = {
      ...structuredClone(info),
      tabId,
      registeredAt: now,
      lastActivityAt: now,
      status: info.status ?? 'idle',
    };
    this.entries.set(tabId, entry);
    this.onRegistered?.(structuredClone(entry));
    return structuredClone(entry);
  }

  /** I-8 entry point + I-3: Map.delete BEFORE the deregistered hook fires. */
  deregister(tabId: string): void {
    if (!this.entries.delete(tabId)) return;
    this.onDeregistered?.(tabId);
  }

  /** In-place status flip — deliberately NO event (§2.2.1 busy/idle churn). */
  setStatus(tabId: string, status: PeerStatus): void {
    const entry = this.entries.get(tabId);
    if (entry) entry.status = status;
  }

  /** lastActivityAt refresh on each inbound turn start (§4.2). */
  touchActivity(tabId: string): void {
    const entry = this.entries.get(tabId);
    if (entry) entry.lastActivityAt = new Date().toISOString();
  }

  has(tabId: string): boolean {
    return this.entries.has(tabId);
  }

  /** I-4 + SEC-08: deep copy — the ONLY source dispatch reads for session inputs. */
  getEntry(tabId: string): PeerRegistryEntry | undefined {
    const entry = this.entries.get(tabId);
    return entry ? structuredClone(entry) : undefined;
  }

  /** peer_list snapshot: deep copies + self flag relative to the caller (I-4). */
  snapshot(callerTabId: string): PeerInfo[] {
    return Array.from(this.entries.values()).map((entry) => ({
      tabId: entry.tabId,
      agentName: entry.agentName,
      role: entry.role,
      capabilities: [...entry.capabilities],
      model: entry.model,
      status: entry.status,
      self: entry.tabId === callerTabId,
    }));
  }

  /** Test/diagnostic accessor — count only, no entries escape. */
  get size(): number {
    return this.entries.size;
  }
}
