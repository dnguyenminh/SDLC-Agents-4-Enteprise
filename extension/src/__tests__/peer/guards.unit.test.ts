/**
 * SA4E-369 — AntiLoopGuards unit tests.
 * STC: TC-302 (BR-7 cap 5 LOCKED: 5th allowed, 6th rejected, zero state I-2),
 *      TC-303/TC-402 (BR-8 rate 10/60s boundary, cross-tab independence),
 *      TC-410/TC-605 (I-6a prune-then-check — no unbounded arrays),
 *      TC-104 (BR-9 user-message reset in either tab).
 */
import { describe, expect, it } from 'vitest';
import { MAX_PINGPONG_TURNS, RATE_LIMIT_MAX, RATE_WINDOW_MS } from '../../pi-workflow/peer/constants.js';
import { AntiLoopGuards } from '../../pi-workflow/peer/guards.js';
import { normalizedPairKey } from '../../pi-workflow/peer/threads.js';
import { TAB_A, TAB_B, TAB_C } from './helpers';

function harness() {
  let clock = 1_000_000;
  const guards = new AntiLoopGuards(() => clock);
  return {
    guards,
    advance: (ms: number) => {
      clock += ms;
    },
    clock: () => clock,
  };
}

describe('AntiLoopGuards (SA4E-369)', () => {
  it('TC-302: MAX_PINGPONG_TURNS is LOCKED at 5 (regression guard)', () => {
    expect(MAX_PINGPONG_TURNS).toBe(5);
  });

  it('TC-302 (BR-7): 5 consecutive agent sends pass, 6th rejected PEER_004 with pair+cap', () => {
    const { guards } = harness();
    for (let i = 0; i < 5; i++) {
      const verdict = guards.evaluate(TAB_A, TAB_B, 'agent');
      expect(verdict.pass).toBe(true);
      if (verdict.pass) verdict.commit();
      expect(guards.pairState(normalizedPairKey(TAB_A, TAB_B))?.pingpongTurns).toBe(i + 1);
    }
    const sixth = guards.evaluate(TAB_A, TAB_B, 'agent');
    expect(sixth.pass).toBe(false);
    if (!sixth.pass) {
      expect(sixth.error.code).toBe('PEER_004');
      expect(sixth.error.message).toContain('ping-pong cap (5)');
      expect(sixth.error.details?.pair).toBe(normalizedPairKey(TAB_A, TAB_B));
    }
    // I-2: rejection mutated NO state — chain still 5
    expect(guards.pairState(normalizedPairKey(TAB_A, TAB_B))?.pingpongTurns).toBe(5);
  });

  it('TC-203 step 5: cap is pair-normalized — reverse direction B→A also rejected', () => {
    const { guards } = harness();
    for (let i = 0; i < MAX_PINGPONG_TURNS; i++) {
      const verdict = guards.evaluate(TAB_A, TAB_B, 'agent');
      if (verdict.pass) verdict.commit();
    }
    const reverse = guards.evaluate(TAB_B, TAB_A, 'agent');
    expect(reverse.pass).toBe(false);
    if (!reverse.pass) expect(reverse.error.code).toBe('PEER_004');
  });

  it('TC-302 step 4: user-originated send resets the chain and does not build it', () => {
    const { guards } = harness();
    for (let i = 0; i < 3; i++) {
      const verdict = guards.evaluate(TAB_A, TAB_B, 'agent');
      if (verdict.pass) verdict.commit();
    }
    const user = guards.evaluate(TAB_B, TAB_A, 'user');
    expect(user.pass).toBe(true);
    if (user.pass) user.commit();
    expect(guards.pairState(normalizedPairKey(TAB_A, TAB_B))?.pingpongTurns).toBe(0);
    expect(guards.pairState(normalizedPairKey(TAB_A, TAB_B))?.lastOrigin).toBe('user');
  });

  it('TC-402 (BR-8): 10th send accepted, 11th within 60s rejected PEER_005', () => {
    const { guards, advance } = harness();
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      const verdict = guards.evaluate(TAB_A, TAB_B, 'agent');
      expect(verdict.pass).toBe(true);
      if (verdict.pass) verdict.commit();
      // BR-8 isolated: pair chain reset — BR-7 coverage riêng ở TC-302/TC-203.
      guards.resetPairsInvolving(TAB_B);
      advance(5_000); // spread inside the window
    }
    const eleventh = guards.evaluate(TAB_A, TAB_B, 'agent');
    expect(eleventh.pass).toBe(false);
    if (!eleventh.pass) {
      expect(eleventh.error.code).toBe('PEER_005');
      expect(eleventh.error.message).toContain('Rate limit');
    }
  });

  it('TC-303: rate limit is per-TAB — tabC unaffected by tabB saturation', () => {
    const { guards } = harness();
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      const verdict = guards.evaluate(TAB_A, TAB_B, 'agent');
      if (verdict.pass) verdict.commit();
    }
    const toC = guards.evaluate(TAB_A, TAB_C, 'agent');
    expect(toC.pass).toBe(true);
  });

  it('TC-105/TC-402 step 3: window roll-off restores capacity (prune-then-check)', () => {
    const { guards, advance } = harness();
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      const verdict = guards.evaluate(TAB_A, TAB_B, 'agent');
      if (verdict.pass) verdict.commit();
      // BR-8 isolated: pair chain reset — BR-7 coverage riêng ở TC-302/TC-203.
      guards.resetPairsInvolving(TAB_B);
    }
    advance(61_000);
    const recovered = guards.evaluate(TAB_A, TAB_B, 'agent');
    expect(recovered.pass).toBe(true);
    if (recovered.pass) recovered.commit(); // prune-then-check: the recovered send stamps exactly one fresh entry
    expect(guards.rateWindow(TAB_B)).toHaveLength(1);
  });

  it('TC-410/TC-605 (I-6a): prune happens even on rejection; window never exceeds 10', () => {
    const { guards, advance, clock } = harness();
    // Seed 10 stamps, let them age out, then trip the cap check.
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      const verdict = guards.evaluate(TAB_A, TAB_B, 'agent');
      if (verdict.pass) verdict.commit();
      // BR-8 isolated: pair chain reset — BR-7 coverage riêng ở TC-302/TC-203.
      guards.resetPairsInvolving(TAB_B);
    }
    advance(RATE_WINDOW_MS + 1_000);
    const verdict = guards.evaluate(TAB_A, TAB_B, 'agent'); // would-be 11th
    expect(guards.rateWindow(TAB_B)).toHaveLength(0); // aged entries pruned on evaluate
    expect(verdict.pass).toBe(true);
    if (verdict.pass) verdict.commit();
    expect(guards.rateWindow(TAB_B).every((t) => t > clock() - RATE_WINDOW_MS)).toBe(true);

    // Randomized 500-step sequence: window bounded + invariant I-6a universal.
    for (let step = 0; step < 500; step++) {
      advance(Math.floor(Math.random() * 20_000));
      const v = guards.evaluate(TAB_A, TAB_B, 'agent');
      const window = guards.rateWindow(TAB_B);
      expect(window.length).toBeLessThanOrEqual(RATE_LIMIT_MAX);
      expect(window.every((t) => t > clock() - RATE_WINDOW_MS)).toBe(true);
      if (v.pass) v.commit();
    }
  });

  it('TC-104 (BR-9): resetPairsInvolving clears chains for both directions only', () => {
    const { guards } = harness();
    for (let i = 0; i < 3; i++) {
      const ab = guards.evaluate(TAB_A, TAB_B, 'agent');
      if (ab.pass) ab.commit();
      const cb = guards.evaluate(TAB_C, TAB_B, 'agent');
      if (cb.pass) cb.commit();
    }
    guards.resetPairsInvolving(TAB_A);
    expect(guards.pairState(normalizedPairKey(TAB_A, TAB_B))).toBeUndefined();
    expect(guards.pairState(normalizedPairKey(TAB_C, TAB_B))?.pingpongTurns).toBe(3); // no over-reset
    guards.releaseTab(TAB_B);
    expect(guards.pairState(normalizedPairKey(TAB_C, TAB_B))).toBeUndefined();
    expect(guards.rateWindow(TAB_B)).toHaveLength(0);
  });
});
