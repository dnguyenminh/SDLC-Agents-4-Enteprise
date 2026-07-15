/**
 * Unit tests for ConnectionStateTracker — SA4E-37
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConnectionStateTracker } from '../ConnectionStateTracker.js';
import type { ServerStateChangeEvent } from '../../types/health.js';

function createMockLogger() {
  return {
    child: () => createMockLogger(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as any;
}

describe('ConnectionStateTracker', () => {
  let tracker: ConnectionStateTracker;
  let logger: any;

  beforeEach(() => {
    logger = createMockLogger();
    tracker = new ConnectionStateTracker(logger);
  });

  describe('register / unregister', () => {
    it('should register a server with disconnected state', () => {
      tracker.register('server-a');
      expect(tracker.getState('server-a')).toBe('disconnected');
    });

    it('should unregister a server and remove its state', () => {
      tracker.register('server-a');
      tracker.unregister('server-a');
      expect(tracker.getState('server-a')).toBeUndefined();
    });

    it('should clear reconnect timer on unregister', () => {
      tracker.register('server-a');
      const entry = tracker.getEntry('server-a')!;
      const timerId = setTimeout(() => {}, 10000);
      entry.reconnectTimerId = timerId;
      tracker.unregister('server-a');
      clearTimeout(timerId);
    });
  });

  describe('valid state transitions', () => {
    it('should transition disconnected → connected', () => {
      tracker.register('s1');
      const result = tracker.transition('s1', 'connected');
      expect(result).toBe(true);
      expect(tracker.getState('s1')).toBe('connected');
    });

    it('should transition connected → unhealthy', () => {
      tracker.register('s1');
      tracker.transition('s1', 'connected');
      const result = tracker.transition('s1', 'unhealthy');
      expect(result).toBe(true);
      expect(tracker.getState('s1')).toBe('unhealthy');
    });

    it('should transition unhealthy → reconnecting', () => {
      tracker.register('s1');
      tracker.transition('s1', 'connected');
      tracker.transition('s1', 'unhealthy');
      const result = tracker.transition('s1', 'reconnecting');
      expect(result).toBe(true);
      expect(tracker.getState('s1')).toBe('reconnecting');
    });

    it('should transition reconnecting → failed', () => {
      tracker.register('s1');
      tracker.transition('s1', 'connected');
      tracker.transition('s1', 'unhealthy');
      tracker.transition('s1', 'reconnecting');
      const result = tracker.transition('s1', 'failed');
      expect(result).toBe(true);
      expect(tracker.getState('s1')).toBe('failed');
    });

    it('should transition reconnecting → connected', () => {
      tracker.register('s1');
      tracker.transition('s1', 'connected');
      tracker.transition('s1', 'unhealthy');
      tracker.transition('s1', 'reconnecting');
      const result = tracker.transition('s1', 'connected');
      expect(result).toBe(true);
      expect(tracker.getState('s1')).toBe('connected');
    });

    it('should transition failed → reconnecting', () => {
      tracker.register('s1');
      tracker.transition('s1', 'connected');
      tracker.transition('s1', 'unhealthy');
      tracker.transition('s1', 'reconnecting');
      tracker.transition('s1', 'failed');
      const result = tracker.transition('s1', 'reconnecting');
      expect(result).toBe(true);
      expect(tracker.getState('s1')).toBe('reconnecting');
    });
  });

  describe('invalid state transitions', () => {
    it('should reject disconnected → unhealthy', () => {
      tracker.register('s1');
      const result = tracker.transition('s1', 'unhealthy');
      expect(result).toBe(false);
      expect(tracker.getState('s1')).toBe('disconnected');
    });

    it('should reject connected → failed', () => {
      tracker.register('s1');
      tracker.transition('s1', 'connected');
      const result = tracker.transition('s1', 'failed');
      expect(result).toBe(false);
      expect(tracker.getState('s1')).toBe('connected');
    });

    it('should reject connected → reconnecting', () => {
      tracker.register('s1');
      tracker.transition('s1', 'connected');
      const result = tracker.transition('s1', 'reconnecting');
      expect(result).toBe(false);
      expect(tracker.getState('s1')).toBe('connected');
    });

    it('should return false for unknown server', () => {
      const result = tracker.transition('unknown', 'connected');
      expect(result).toBe(false);
    });
  });

  describe('ping success / failure recording', () => {
    it('should reset consecutiveFailures on ping success', () => {
      tracker.register('s1');
      tracker.transition('s1', 'connected');
      const entry = tracker.getEntry('s1')!;
      entry.consecutiveFailures = 3;
      tracker.recordPingSuccess('s1');
      expect(tracker.getEntry('s1')!.consecutiveFailures).toBe(0);
      expect(tracker.getEntry('s1')!.lastHealthCheck).not.toBeNull();
    });

    it('should increment consecutiveFailures on ping failure', () => {
      tracker.register('s1');
      tracker.transition('s1', 'connected');
      tracker.recordPingFailure('s1', 'timeout');
      tracker.recordPingFailure('s1', 'timeout');
      expect(tracker.getEntry('s1')!.consecutiveFailures).toBe(2);
      expect(tracker.getEntry('s1')!.lastError).toBe('timeout');
    });

    it('should set failureStartedAt on first failure only', () => {
      tracker.register('s1');
      tracker.transition('s1', 'connected');
      tracker.recordPingFailure('s1', 'err');
      const first = tracker.getEntry('s1')!.failureStartedAt;
      expect(first).not.toBeNull();
      tracker.recordPingFailure('s1', 'err2');
      expect(tracker.getEntry('s1')!.failureStartedAt).toBe(first);
    });

    it('should do nothing for unknown server on recordPingSuccess', () => {
      tracker.recordPingSuccess('unknown');
    });
  });

  describe('threshold breach detection', () => {
    it('should detect threshold breach when failures >= threshold', () => {
      tracker.register('s1');
      tracker.transition('s1', 'connected');
      tracker.recordPingFailure('s1', 'err');
      tracker.recordPingFailure('s1', 'err');
      expect(tracker.isThresholdBreached('s1', 2)).toBe(true);
    });

    it('should not detect breach when failures < threshold', () => {
      tracker.register('s1');
      tracker.transition('s1', 'connected');
      tracker.recordPingFailure('s1', 'err');
      expect(tracker.isThresholdBreached('s1', 2)).toBe(false);
    });

    it('should return false for unknown server', () => {
      expect(tracker.isThresholdBreached('unknown', 2)).toBe(false);
    });
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
