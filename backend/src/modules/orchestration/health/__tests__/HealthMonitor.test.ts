/**
 * Unit tests for HealthMonitor — SA4E-37
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HealthMonitor } from '../HealthMonitor.js';
import type { HealthMonitorDeps } from '../HealthMonitor.js';
import { DEFAULT_HEALTH_CONFIG } from '../../types/health.js';

function createMockLogger() {
  return {
    child: () => createMockLogger(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as any;
}

function createMockClient(shouldReject = false) {
  return {
    listTools: vi.fn(() => {
      if (shouldReject) return Promise.reject(new Error('connection lost'));
      return Promise.resolve({ tools: [] });
    }),
  } as any;
}

describe('HealthMonitor', () => {
  let monitor: HealthMonitor;
  let deps: HealthMonitorDeps;
  let logger: any;

  beforeEach(() => {
    vi.useFakeTimers();
    logger = createMockLogger();
    deps = {
      getConnectedServers: vi.fn(() => new Map()),
      onPingSuccess: vi.fn(),
      onPingFailed: vi.fn(),
    };
    monitor = new HealthMonitor(logger, deps, { ...DEFAULT_HEALTH_CONFIG });
  });

  afterEach(() => {
    monitor.stop();
    vi.useRealTimers();
  });

  describe('start / stop lifecycle', () => {
    it('should start and set interval', () => {
      expect(monitor.isRunning()).toBe(false);
      monitor.start();
      expect(monitor.isRunning()).toBe(true);
    });

    it('should stop and clear interval', () => {
      monitor.start();
      monitor.stop();
      expect(monitor.isRunning()).toBe(false);
    });

    it('should not create duplicate intervals if start called twice', () => {
      monitor.start();
      monitor.start();
      expect(monitor.isRunning()).toBe(true);
      monitor.stop();
      expect(monitor.isRunning()).toBe(false);
    });

    it('should invoke runCycle on interval tick', async () => {
      const client = createMockClient();
      (deps.getConnectedServers as any).mockReturnValue(new Map([['s1', client]]));
      monitor.start();
      await vi.advanceTimersByTimeAsync(DEFAULT_HEALTH_CONFIG.interval);
      expect(deps.onPingSuccess).toHaveBeenCalledWith('s1');
    });
  });

  describe('parallel pings via mock clients', () => {
    it('should ping all connected servers in parallel', async () => {
      const client1 = createMockClient();
      const client2 = createMockClient();
      (deps.getConnectedServers as any).mockReturnValue(
        new Map([['s1', client1], ['s2', client2]])
      );
      await monitor.runCycle();
      expect(deps.onPingSuccess).toHaveBeenCalledWith('s1');
      expect(deps.onPingSuccess).toHaveBeenCalledWith('s2');
      expect(client1.listTools).toHaveBeenCalled();
      expect(client2.listTools).toHaveBeenCalled();
    });

    it('should call onPingFailed when client.listTools rejects', async () => {
      const client = createMockClient(true);
      (deps.getConnectedServers as any).mockReturnValue(new Map([['s1', client]]));
      await monitor.runCycle();
      expect(deps.onPingFailed).toHaveBeenCalledWith('s1', 'connection lost');
    });
  });

  describe('ping timeout triggers onPingFailed', () => {
    it('should fail with timeout when client takes too long', async () => {
      const config = { ...DEFAULT_HEALTH_CONFIG, pingTimeout: 100 };
      monitor = new HealthMonitor(logger, deps, config);

      const slowClient = {
        listTools: vi.fn(() => new Promise(() => {})),
      } as any;

      (deps.getConnectedServers as any).mockReturnValue(new Map([['s1', slowClient]]));

      const cyclePromise = monitor.runCycle();
      await vi.advanceTimersByTimeAsync(200);
      await cyclePromise;

      expect(deps.onPingFailed).toHaveBeenCalledWith('s1', expect.stringContaining('timeout'));
    });
  });

  describe('empty server list', () => {
    it('should skip cycle when no servers connected', async () => {
      (deps.getConnectedServers as any).mockReturnValue(new Map());
      await monitor.runCycle();
      expect(deps.onPingSuccess).not.toHaveBeenCalled();
      expect(deps.onPingFailed).not.toHaveBeenCalled();
    });
  });

  describe('multiple servers pinged concurrently', () => {
    it('should handle mixed success and failure', async () => {
      const okClient = createMockClient(false);
      const failClient = createMockClient(true);
      (deps.getConnectedServers as any).mockReturnValue(
        new Map([['ok', okClient], ['fail', failClient]])
      );
      await monitor.runCycle();
      expect(deps.onPingSuccess).toHaveBeenCalledWith('ok');
      expect(deps.onPingFailed).toHaveBeenCalledWith('fail', 'connection lost');
    });
  });

  describe('updateConfig', () => {
    it('should restart with new config if running', () => {
      monitor.start();
      expect(monitor.isRunning()).toBe(true);
      const newConfig = { ...DEFAULT_HEALTH_CONFIG, interval: 5000 };
      monitor.updateConfig(newConfig);
      expect(monitor.isRunning()).toBe(true);
    });
  });
});
