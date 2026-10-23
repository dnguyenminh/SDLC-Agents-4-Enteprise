/**
 * E2E API Tests — Admin Portal: Configuration get/patch/reset.
 * (Split from admin-api.e2e.test.ts — BR-18 ≤200 lines/file.)
 *
 * Run: npm run test:e2e-api
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { E2E_PORT } from './setup/e2e-config.js';
import { apiCall, ensureServerUp, login, logout } from './admin-api.fixtures.js';

beforeAll(async () => {
  await ensureServerUp();
  await login();
});

// ============================================================
// 6. Configuration
// ============================================================

describe('Config — Get, Patch, Reset', () => {
  it('should get current configuration', async () => {
    const { status, data } = await apiCall('/config');
    expect(status).toBe(200);
    expect(data.config).toBeDefined();
    expect(data.config.server).toBeDefined();
    expect(data.config.server.port).toBe(E2E_PORT);
    expect(data.config.embedding).toBeDefined();
    expect(data.config.kb).toBeDefined();
    expect(data.restartRequired).toBeDefined();
  });

  it('should patch a config value (hot-reload key)', async () => {
    const { status, data } = await apiCall('/config/server/logLevel', {
      method: 'PATCH',
      body: JSON.stringify({ value: 'debug' }),
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.requiresRestart).toBe(false);
    expect(data.value).toBe('debug');
  });

  it('should verify the config change', async () => {
    const { status, data } = await apiCall('/config');
    expect(status).toBe(200);
    expect(data.config.server.logLevel).toBe('debug');
  });

  it('should patch a restart-required key and flag it', async () => {
    const { status, data } = await apiCall('/config/server/port', {
      method: 'PATCH',
      body: JSON.stringify({ value: 48722 }),
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.requiresRestart).toBe(true);
  });

  it('should reset a section to defaults', async () => {
    const { status, data } = await apiCall('/config/server/reset', {
      method: 'POST',
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.config).toBeDefined();
    // After reset, port should be back to default
    expect(data.config.port).toBe(E2E_PORT);
  });

  it('should verify defaults restored after reset', async () => {
    const { status, data } = await apiCall('/config');
    expect(status).toBe(200);
    expect(data.config.server.port).toBe(E2E_PORT);
    expect(data.config.server.logLevel).toBe('info');
  });

  it('should return 404 for non-existent section', async () => {
    const { status } = await apiCall('/config/nonexistent/key', {
      method: 'PATCH',
      body: JSON.stringify({ value: 'x' }),
    });
    expect(status).toBe(404);
  });

  it('should return 404 for non-existent key', async () => {
    const { status } = await apiCall('/config/server/nonexistent', {
      method: 'PATCH',
      body: JSON.stringify({ value: 'x' }),
    });
    expect(status).toBe(404);
  });
});

afterAll(async () => {
  await logout();
});
