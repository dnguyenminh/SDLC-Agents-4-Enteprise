/**
 * SA4E-369 — PeerRegistry unit tests.
 * STC: TC-300 (BR-1 auto register/deregister, I-3 update-then-emit),
 *      TC-411 (I-1 idempotent re-register, no duplicate event),
 *      TC-412 (I-4 deep-copy snapshots — registry + getEntry SEC-08).
 */
import { describe, expect, it, vi } from 'vitest';
import { PeerRegistry } from '../../pi-workflow/peer/registry.js';
import { metaFor, TAB_A, TAB_B, TAB_C } from './helpers';

describe('PeerRegistry (SA4E-369)', () => {
  it('TC-300: register adds entry; deregister removes and fires after Map.delete', () => {
    const registry = new PeerRegistry();
    const seen: string[] = [];
    registry.onRegistered = (e) => seen.push(`registered:${e.tabId}`);
    registry.onDeregistered = (id) => seen.push(`deregistered:${id}`);

    registry.register(TAB_A, metaFor(TAB_A));
    expect(registry.has(TAB_A)).toBe(true);
    expect(seen).toEqual([`registered:${TAB_A}`]);

    registry.deregister(TAB_A);
    expect(registry.has(TAB_A)).toBe(false);
    // update-then-emit: deregistered fired AFTER the delete
    expect(seen).toEqual([`registered:${TAB_A}`, `deregistered:${TAB_A}`]);
    expect(registry.size).toBe(0);
  });

  it('TC-411 (I-1): re-register on same id updates in place, no duplicate event', () => {
    const registry = new PeerRegistry();
    const registered: string[] = [];
    registry.onRegistered = (e) => registered.push(e.tabId);
    registry.register(TAB_A, metaFor(TAB_A));
    const again = registry.register(TAB_A, metaFor(TAB_A, { agentName: 'Renamed' }));
    expect(registered).toEqual([TAB_A]); // no duplicate peer:registered
    expect(again.agentName).toBe('Renamed');
    expect(registry.size).toBe(1);
  });

  it('TC-003/TC-412 (I-4): snapshot deep copy + self flag; mutation does not leak', () => {
    const registry = new PeerRegistry();
    registry.register(TAB_A, metaFor(TAB_A));
    registry.register(TAB_B, metaFor(TAB_B, { role: 'reviewer', capabilities: ['code-review'] }));

    const snapshot = registry.snapshot(TAB_B);
    expect(snapshot).toHaveLength(2);
    const selfEntry = snapshot.find((p) => p.tabId === TAB_B);
    const other = snapshot.find((p) => p.tabId === TAB_A);
    expect(selfEntry?.self).toBe(true);
    expect(other?.self).toBe(false);
    expect(selfEntry?.role).toBe('reviewer');

    // Mutate every field of the returned snapshot — registry unchanged.
    selfEntry!.status = 'busy';
    selfEntry!.capabilities.push('injected');
    const fresh = registry.snapshot(TAB_B).find((p) => p.tabId === TAB_B);
    expect(fresh?.status).toBe('idle');
    expect(fresh?.capabilities).toEqual(['code-review']);
  });

  it('TC-412 (I-4/SEC-08): getEntry returns a deep copy — dispatch input isolation', () => {
    const registry = new PeerRegistry();
    registry.register(TAB_A, metaFor(TAB_A));
    const entry = registry.getEntry(TAB_A)!;
    entry.providerId = 'hacked';
    entry.capabilities.push('x');
    const fresh = registry.getEntry(TAB_A)!;
    expect(fresh.providerId).toBe('test-provider');
    expect(fresh.capabilities).toEqual(['implement']);
    expect(registry.getEntry('ghost')).toBeUndefined();
  });

  it('TC-300: setStatus flips in place without events; touchActivity refreshes', () => {
    const registry = new PeerRegistry();
    const events: string[] = [];
    registry.onRegistered = () => events.push('registered');
    registry.onDeregistered = () => events.push('deregistered');
    registry.register(TAB_C, metaFor(TAB_C));
    registry.setStatus(TAB_C, 'busy');
    expect(registry.getEntry(TAB_C)?.status).toBe('busy');
    registry.touchActivity(TAB_C);
    expect(registry.getEntry(TAB_C)?.lastActivityAt).toBeTruthy();
    expect(events).toEqual(['registered']); // busy/idle churn emits nothing (§2.2.1)
  });

  it('TC-300: deregister of unknown id is a silent no-op', () => {
    const registry = new PeerRegistry();
    const spy = vi.fn();
    registry.onDeregistered = spy;
    expect(() => registry.deregister('ghost')).not.toThrow();
    expect(spy).not.toHaveBeenCalled();
  });
});
