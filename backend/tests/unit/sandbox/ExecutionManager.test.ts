import { describe, it, expect } from 'vitest';
import { ExecutionManager } from '../../../src/modules/sandbox/ExecutionManager.js';
import { BUILTIN_HARDENING } from '../../../src/modules/sandbox/executors/hardening.js';
import { SandboxConfigSchema } from '../../../src/config/SandboxConfig.js';
import { MaxSessionsError } from '../../../src/modules/sandbox/errors.js';
import { createMockLogger } from './mockLogger.js';

function makeManager(overrides: Record<string, unknown> = {}) {
  const config = SandboxConfigSchema.parse({ defaultMode: 'local', maxSessions: 3, ...overrides });
  return new ExecutionManager(createMockLogger(), config, BUILTIN_HARDENING);
}

describe('ExecutionManager (local mode)', () => {
  it('creates and lists a session (TC-19)', async () => {
    const m = makeManager();
    await m.initialize();
    const s = await m.createSession({ mode: 'local' });
    expect(s.mode).toBe('local');
    const list = m.listSessions();
    expect(list.length).toBe(1);
    expect(list[0].sessionId).toBe(s.sessionId);
    await m.shutdown();
  });

  it('executes through the manager and auto-destroys the ephemeral session (UC-04)', async () => {
    const m = makeManager();
    await m.initialize();
    const r = await m.execute(undefined, `node -e "console.log('hi')"`, { timeout: 30 });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('hi');
    expect(m.activeCount).toBe(0);
    await m.shutdown();
  });

  it('enforces the max-sessions limit (TC-14)', async () => {
    const m = makeManager({ maxSessions: 2 });
    await m.initialize();
    await m.createSession({ mode: 'local' });
    await m.createSession({ mode: 'local' });
    await expect(m.createSession({ mode: 'local' })).rejects.toBeInstanceOf(MaxSessionsError);
    await m.shutdown();
  });

  it('reaps expired sessions (TC-06)', async () => {
    const m = makeManager();
    await m.initialize();
    const s = await m.createSession({ mode: 'local', ttl: 0 });
    m.getSession(s.sessionId)!.lastActivity = new Date(Date.now() - 10000);
    const reaped = await m.reapExpired();
    expect(reaped).toBe(1);
    expect(m.activeCount).toBe(0);
    await m.shutdown();
  });

  it('falls back to local when docker is requested but unavailable (UC-13)', async (ctx) => {
    const m = makeManager({ defaultMode: 'docker' });
    await m.initialize();
    // Environment-dependent: the fallback premise only holds when Docker is actually
    // unavailable. When Docker is present the session legitimately runs in docker mode,
    // so the assertion does not apply (mirrors TC-04/09/18 env-gating in STATUS.json).
    if (m.dockerReady) {
      await m.shutdown();
      ctx.skip();
      return;
    }
    const s = await m.createSession({ mode: 'docker' });
    expect(s.mode).toBe('local');
    await m.shutdown();
  });
});
