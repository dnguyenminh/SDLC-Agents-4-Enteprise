/**
 * SA4E-369 — AntiLoopGuards (AC3, BR-7/BR-8/BR-9). Owns GUARD_STATE (per-pair
 * ping-pong chain) + RATE_STATE (per-tab rolling window). Synchronous
 * evaluate-or-reject; counter ownership is PeerBus-side ONLY (FSD §3.4.4).
 * I-2: check + commit run in one tick — commit() is invoked by the bus in the
 * SAME synchronous block, only after every later rejection point passed.
 */
import { MAX_PINGPONG_TURNS, RATE_LIMIT_MAX, RATE_WINDOW_MS } from './constants.js';
import { PEER_MESSAGES, peerError } from './errors.js';
import { normalizedPairKey } from './threads.js';
import type { GuardVerdict, PairGuardState } from './types.js';

export class AntiLoopGuards {
  private readonly pairs = new Map<string, PairGuardState>();
  private readonly rate = new Map<string, number[]>(); // tabId → epoch ms window

  constructor(private readonly now: () => number = Date.now) {}

  /**
   * I-6a prune-then-check in ONE tick: aged timestamps are dropped BEFORE the
   * cap check (even on rejection — pruning is bounded-state maintenance, the
   * only mutation a rejection may perform). Append happens in commit() only.
   */
  evaluate(from: string, to: string, origin: 'agent' | 'user'): GuardVerdict {
    const pairKey = normalizedPairKey(from, to);
    const window = this.pruneWindow(to);
    if (origin === 'user') {
      // BR-9 counting definition: a user-originated send resets the chain.
      return { pass: true, commit: () => this.commitUser(pairKey) };
    }
    const chain = this.pairs.get(pairKey)?.pingpongTurns ?? 0;
    if (chain >= MAX_PINGPONG_TURNS) {
      return {
        pass: false,
        error: peerError('PEER_004', PEER_MESSAGES.PEER_004(pairKey, MAX_PINGPONG_TURNS), {
          pair: pairKey,
          cap: MAX_PINGPONG_TURNS,
        }),
      };
    }
    if (window.length >= RATE_LIMIT_MAX) {
      return {
        pass: false,
        error: peerError('PEER_005', PEER_MESSAGES.PEER_005_RATE(to), { tabId: to, count: window.length }),
      };
    }
    return {
      pass: true,
      commit: () => this.commitAgent(pairKey, chain, window),
    };
  }

  /** BR-9 reset: clear the chain of EVERY pair involving tabId (rate kept). */
  resetPairsInvolving(tabId: string): void {
    for (const key of this.pairs.keys()) {
      if (key.split('|').includes(tabId)) this.pairs.delete(key);
    }
  }

  /** I-8: drop all pair + rate state involving tabId (single cleanup point). */
  releaseTab(tabId: string): void {
    this.resetPairsInvolving(tabId);
    this.rate.delete(tabId);
  }

  /** Test/diagnostic accessor — deep copy of the rolling window (I-6a probe). */
  rateWindow(tabId: string): number[] {
    return [...(this.rate.get(tabId) ?? [])];
  }

  /** Test/diagnostic accessor — deep copy of the pair chain state. */
  pairState(pairKey: string): PairGuardState | undefined {
    const state = this.pairs.get(pairKey);
    return state ? structuredClone(state) : undefined;
  }

  private pruneWindow(tabId: string): number[] {
    const cutoff = this.now() - RATE_WINDOW_MS;
    const window = (this.rate.get(tabId) ?? []).filter((t) => t > cutoff);
    this.rate.set(tabId, window);
    return window;
  }

  private commitUser(pairKey: string): void {
    this.pairs.set(pairKey, { pairKey, pingpongTurns: 0, lastOrigin: 'user' });
  }

  private commitAgent(pairKey: string, chain: number, window: number[]): void {
    this.pairs.set(pairKey, { pairKey, pingpongTurns: chain + 1, lastOrigin: 'agent' });
    window.push(this.now());
  }
}
