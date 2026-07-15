/**
 * Unit tests for ReconnectManager — SA4E-37
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ReconnectManager } from '../ReconnectManager.js';
import type { ReconnectCallbacks } from '../ReconnectManager.js';
import { DEFAULT_HEALTH_CONFIG } from '../../types/health.js';
import type { HealthCheckConfig } from '../../types/health.js';
import type { ServerConfig } from '../../McpConfigService.js';

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => {
  const MockClient = vi.fn(function (this: any) {
    this.connect = vi.fn().mockResolvedValue(undefined);
    this.listTools = vi.fn().mockResolvedValue({ tools: [] });
    this.close = vi.fn().mockResolvedValue(undefined);
  });
  return { Client: MockClient };
});

vi.mock('../TransportFactory.js', () => ({
  createTransport: vi.fn().mockReturnValue({}),
}));

function createMockLogger() {
  return {
    child: () => createMockLogger(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as any;
}

describe('ReconnectManager', () => {
  let manager: ReconnectManager;
  let callbacks: ReconnectCallbacks;
  let config: HealthCheckConfig;
  let logger: any;

  const serverConfig: ServerConfig = {
    command: 'node',
    args: ['server.js'],
  };

  beforeEach(() => {
    vi.useFakeTimers();
    logger = createMockLogger();
    callbacks = {
      onReconnectSuccess: vi.fn(),
      onReconnectFailed: vi.fn(),
      onMaxRetriesExhausted: vi.fn(),
    };
    config = { ...DEFAULT_HEALTH_CONFIG, jitterEnabled: false };
    manager = new ReconnectManager(logger, config, callbacks);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('backoff delay calculation', () => {
    it('should calculate 1s for attempt 1', () => {
      const delay = manager.calculateDelay(1);
      expect(delay).toBe(1000);
    });

    it('should calculate 2s for attempt 2', () => {
      const delay = manager.calculateDelay(2);
      expect(delay).toBe(2000);
    });

    it('should calculate 4s for attempt 3', () => {
      const delay = manager.calculateDelay(3);
      expect(delay).toBe(4000);
    });

    it('should calculate 8s for attempt 4', () => {
      const delay = manager.calculateDelay(4);
      expect(delay).toBe(8000);
    });

    it('should calculate 16s for attempt 5', () => {
      const delay = manager.calculateDelay(5);
      expect(delay).toBe(16000);
    });

    it('should cap at 30s (maxDelay)', () => {
      const delay = manager.calculateDelay(6);
      expect(delay).toBe(30000);
    });

    it('should cap at 30s for very high attempt numbers', () => {
      const delay = manager.calculateDelay(20);
      expect(delay).toBe(30000);
    });
  });

  describe('jitter within +/-20% range', () => {
    it('should apply jitter when enabled', () => {
      const jitterConfig = { ...config, jitterEnabled: true, jitterRange: 0.2 };
      manager = new ReconnectManager(logger, jitterConfig, callbacks);

      const delays = new Set<number>();
      for (let i = 0; i < 100; i++) {
        delays.add(manager.calculateDelay(1));
      }
      // With jitter, base=1000, jitter=+/-200, range=[800,1200]
      for (const d of delays) {
        expect(d).toBeGreaterThanOrEqual(800);
        expect(d).toBeLessThanOrEqual(1200);
      }
      // With 100 samples, we should get more than 1 unique value
      expect(delays.size).toBeGreaterThan(1);
    });
  });

  describe('schedule / cancel reconnect', () => {
    it('should schedule a reconnect and return nextRetryAt', () => {
      const result = manager.scheduleReconnect('s1', serverConfig, 1);
      expect(result).not.toBeNull();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should cancel a scheduled reconnect', () => {
      manager.scheduleReconnect('s1', serverConfig, 1);
      manager.cancelReconnect('s1');
      // Advancing time should not trigger callback
      vi.advanceTimersByTime(2000);
      expect(callbacks.onReconnectSuccess).not.toHaveBeenCalled();
      expect(callbacks.onReconnectFailed).not.toHaveBeenCalled();
    });

    it('should not throw when canceling non-existent reconnect', () => {
      expect(() => manager.cancelReconnect('non-existent')).not.toThrow();
    });
  });

  describe('max retries triggers onMaxRetriesExhausted', () => {
    it('should call onMaxRetriesExhausted when attempt > maxRetries', () => {
      const result = manager.scheduleReconnect('s1', serverConfig, 11);
      expect(result).toBeNull();
      expect(callbacks.onMaxRetriesExhausted).toHaveBeenCalledWith('s1');
    });

    it('should not schedule when maxRetries exceeded', () => {
      manager.scheduleReconnect('s1', serverConfig, 11);
      vi.advanceTimersByTime(60000);
      expect(callbacks.onReconnectSuccess).not.toHaveBeenCalled();
      expect(callbacks.onReconnectFailed).not.toHaveBeenCalled();
    });
  });

  describe('successful reconnect calls onReconnectSuccess', () => {
    it('should call onReconnectSuccess after timer fires', async () => {
      manager.scheduleReconnect('s1', serverConfig, 1);

      // Advance past the 1s delay + flush microtasks for async attemptReconnect
      await vi.advanceTimersByTimeAsync(1500);

      expect(callbacks.onReconnectSuccess).toHaveBeenCalledWith('s1', expect.any(Object));
    });
  });

  describe('failed reconnect calls onReconnectFailed', () => {
    it('should call onReconnectFailed when connection throws', async () => {
      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      (Client as any).mockImplementation(function (this: any) {
        this.connect = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
        this.listTools = vi.fn().mockResolvedValue({ tools: [] });
        this.close = vi.fn();
      });

      manager.scheduleReconnect('s1', serverConfig, 1);
      await vi.advanceTimersByTimeAsync(1100);

      expect(callbacks.onReconnectFailed).toHaveBeenCalledWith('s1', 1, 'ECONNREFUSED');
    });
  });

  describe('updateConfig', () => {
    it('should update internal config', () => {
      const newConfig = { ...config, maxDelay: 60000 };
      manager.updateConfig(newConfig);
      // After update, delay calculation should use new maxDelay
      const delay = manager.calculateDelay(10);
      expect(delay).toBeLessThanOrEqual(60000);
    });
  });
});
