/**
 * SA4E-369 — per-pair bounded conversation threads (D3, FR-9, BR-11).
 * A→B and B→A share ONE thread (order-independent normalized key). Threads
 * involving a deregistered tab are dropped entirely (I-8). Bound: 50 entries
 * FIFO (I-5). Pure in-memory (BR-12).
 */
import { THREAD_MAX_ENTRIES } from './constants.js';
import type { PeerMessage, PeerThread } from './types.js';

/** Normalized unordered pair key — same identity for threads and guards. */
export function normalizedPairKey(tabA: string, tabB: string): string {
  return [tabA, tabB].sort().join('|');
}

export class PeerThreadStore {
  private readonly threads = new Map<string, PeerThread>();

  constructor(private readonly maxEntries: number = THREAD_MAX_ENTRIES) {}

  /** I-5: thread length ≤ maxEntries after every append (FIFO evict oldest). */
  append(threadKey: string, msg: PeerMessage): void {
    let thread = this.threads.get(threadKey);
    if (!thread) {
      thread = { threadKey, maxEntries: this.maxEntries, messages: [] };
      this.threads.set(threadKey, thread);
    }
    thread.messages.push(structuredClone(msg));
    while (thread.messages.length > this.maxEntries) {
      thread.messages.shift();
    }
  }

  /** I-4: deep-copied snapshot; unknown key → empty array. */
  snapshot(threadKey: string): PeerMessage[] {
    const thread = this.threads.get(threadKey);
    return thread ? structuredClone(thread.messages) : [];
  }

  /** I-8: drop every thread that mentions the tab (single cleanup point). */
  dropThreadsInvolving(tabId: string): void {
    for (const [key, thread] of this.threads) {
      const involved = thread.messages.some((m) => m.fromTabId === tabId || m.toTabId === tabId);
      if (involved) this.threads.delete(key);
    }
  }

  /** Test/diagnostic accessor — count only. */
  get size(): number {
    return this.threads.size;
  }
}
