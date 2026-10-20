/**
 * Unit tests for ConnectionStateTracker — SA4E-37.
 * This file: ping success/failure recording + threshold breach detection.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConnectionStateTracker } from '../ConnectionStateTracker.js';
import { createMockLogger } from './helpers.js';

describe('ConnectionStateTracker', () => {
  let tracker: ConnectionStateTracker;
  let logger: any;

  beforeEach(() => {
    logger = createMockLogger();
    tracker = new ConnectionStateTracker(logger);
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
});
