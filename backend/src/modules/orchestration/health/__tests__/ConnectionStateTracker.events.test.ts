/**
 * Unit tests for ConnectionStateTracker — SA4E-37.
 * This file: event emission, listener isolation, unsubscribe, reset + statuses.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConnectionStateTracker } from '../ConnectionStateTracker.js';
import type { ServerStateChangeEvent } from '../../types/health.js';
import { createMockLogger } from './helpers.js';

describe('ConnectionStateTracker', () => {
  let tracker: ConnectionStateTracker;
  let logger: any;

  beforeEach(() => {
    logger = createMockLogger();
    tracker = new ConnectionStateTracker(logger);
  });

  describe('event emission to listeners', () => {
    it('should emit event on valid transition', () => {
      tracker.register('s1');
      const events: ServerStateChangeEvent[] = [];
      tracker.onStateChange((e) => events.push(e));
      tracker.transition('s1', 'connected');
      expect(events).toHaveLength(1);
      expect(events[0].serverName).toBe('s1');
      expect(events[0].previousState).toBe('disconnected');
      expect(events[0].newState).toBe('connected');
      expect(events[0].timestamp).toBeTruthy();
    });

    it('should not emit event on invalid transition', () => {
      tracker.register('s1');
      const events: ServerStateChangeEvent[] = [];
      tracker.onStateChange((e) => events.push(e));
      tracker.transition('s1', 'failed');
      expect(events).toHaveLength(0);
    });

    it('should include error in event when provided', () => {
      tracker.register('s1');
      tracker.transition('s1', 'connected');
      const events: ServerStateChangeEvent[] = [];
      tracker.onStateChange((e) => events.push(e));
      tracker.transition('s1', 'unhealthy', 'ping timeout');
      expect(events[0].error).toBe('ping timeout');
    });
  });

  describe('listener error isolation', () => {
    it('should still call other listeners if one throws', () => {
      tracker.register('s1');
      const called: string[] = [];
      tracker.onStateChange(() => { throw new Error('listener error'); });
      tracker.onStateChange((e) => { called.push(e.serverName); });
      tracker.transition('s1', 'connected');
      expect(called).toEqual(['s1']);
    });
  });

  describe('unsubscribe', () => {
    it('should stop receiving events after unsubscribe', () => {
      tracker.register('s1');
      const events: ServerStateChangeEvent[] = [];
      const unsub = tracker.onStateChange((e) => events.push(e));
      tracker.transition('s1', 'connected');
      expect(events).toHaveLength(1);
      unsub();
      tracker.transition('s1', 'unhealthy');
      expect(events).toHaveLength(1);
    });

    it('should throw TypeError for non-function callback', () => {
      expect(() => tracker.onStateChange('not a function' as any)).toThrow(TypeError);
    });
  });

  describe('resetReconnectState', () => {
    it('should reset all reconnect-related fields', () => {
      tracker.register('s1');
      tracker.transition('s1', 'connected');
      const entry = tracker.getEntry('s1')!;
      entry.reconnectAttempts = 5;
      entry.consecutiveFailures = 3;
      entry.lastError = 'timeout';
      entry.failureStartedAt = new Date().toISOString();
      entry.nextRetryAt = new Date().toISOString();
      tracker.resetReconnectState('s1');
      const reset = tracker.getEntry('s1')!;
      expect(reset.reconnectAttempts).toBe(0);
      expect(reset.consecutiveFailures).toBe(0);
      expect(reset.lastError).toBeNull();
      expect(reset.failureStartedAt).toBeNull();
      expect(reset.nextRetryAt).toBeNull();
    });
  });

  describe('getAllStatuses', () => {
    it('should return status entries for all registered servers', () => {
      tracker.register('s1');
      tracker.register('s2');
      tracker.transition('s1', 'connected');
      const statuses = tracker.getAllStatuses(() => 3);
      expect(statuses).toHaveLength(2);
      const s1 = statuses.find((s) => s.name === 's1')!;
      expect(s1.state).toBe('connected');
      expect(s1.connected).toBe(true);
      expect(s1.toolCount).toBe(3);
      const s2 = statuses.find((s) => s.name === 's2')!;
      expect(s2.state).toBe('disconnected');
      expect(s2.connected).toBe(false);
    });
  });
});
