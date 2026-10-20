/**
 * Unit tests for ConnectionStateTracker — SA4E-37.
 * This file: register/unregister + state transitions.
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
});
