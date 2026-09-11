/**
 * SA4E-167 — GateGuardService unit tests.
 * Tests evaluate(), addPattern(), removePattern(), processOverride(), ReDoS rejection.
 * Uses in-memory mock repository — no real SQLite dependency.
 * SA4E-215: repository + service methods are async (multi-engine support).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GateGuardService } from '../GateGuardService.js';
import type { GateGuardRepository } from '../GateGuardRepository.js';
import type { DenyPattern, GateGuardAction, AuditEntry } from '../models.js';
import type { InsertAuditParams } from '../GateGuardRepository.js';
import pino from 'pino';

/** In-memory mock repository — satisfies GateGuardRepository interface (async) */
class MockGateGuardRepository implements Pick<GateGuardRepository,
  'ensureSchema' | 'insertAudit' | 'queryAudit' | 'getPatterns' | 'addPattern' | 'removePattern'
> {
  private patterns: DenyPattern[] = [];
  private auditLog: AuditEntry[] = [];

  async ensureSchema(): Promise<void> { /* no-op for in-memory */ }

  async insertAudit(params: InsertAuditParams): Promise<void> {
    this.auditLog.push({
      id: this.auditLog.length + 1,
      timestamp: new Date().toISOString(),
      command: params.command,
      agent: params.agent,
      patternMatched: params.patternMatched,
      action: params.action,
      overrideBy: params.overrideBy,
      projectId: params.projectId,
      contextJson: params.contextJson,
    });
  }

  async queryAudit(
    projectId?: string, limit = 50, actionFilter?: GateGuardAction,
  ): Promise<AuditEntry[]> {
    let entries = [...this.auditLog];
    if (projectId) entries = entries.filter(e => e.projectId === projectId);
    if (actionFilter) entries = entries.filter(e => e.action === actionFilter);
    return entries.slice(0, limit);
  }

  async getPatterns(projectId?: string): Promise<DenyPattern[]> {
    if (projectId) {
      return this.patterns.filter(
        p => p.projectId === projectId || !p.projectId,
      );
    }
    return [...this.patterns];
  }

  async addPattern(pattern: DenyPattern): Promise<void> {
    this.patterns.push(pattern);
  }

  async removePattern(patternId: string): Promise<boolean> {
    const idx = this.patterns.findIndex(
      p => p.id === patternId && !p.isDefault,
    );
    if (idx === -1) return false;
    this.patterns.splice(idx, 1);
    return true;
  }
}

const logger = pino({ level: 'silent' });

describe('GateGuardService', () => {
  let service: GateGuardService;
  let repo: MockGateGuardRepository;

  beforeEach(() => {
    repo = new MockGateGuardRepository();
    service = new GateGuardService(
      repo as unknown as GateGuardRepository,
      logger,
    );
  });

  describe('evaluate() — safe commands', () => {
    it('allows git commit', async () => {
      const result = await service.evaluate('git commit -m "fix typo"');
      expect(result.action).toBe('allowed');
    });

    it('allows npm install', async () => {
      const result = await service.evaluate('npm install express');
      expect(result.action).toBe('allowed');
    });

    it('allows ls -la', async () => {
      const result = await service.evaluate('ls -la /home/user');
      expect(result.action).toBe('allowed');
    });
  });

  describe('evaluate() — destructive commands blocked', () => {
    it('blocks rm -rf /', async () => {
      const result = await service.evaluate('rm -rf /');
      expect(result.action).toBe('blocked');
      expect(result.patternMatched).toBeDefined();
    });

    it('blocks rm -rf ~', async () => {
      const result = await service.evaluate('rm -rf ~');
      expect(result.action).toBe('blocked');
    });

    it('blocks git push --force', async () => {
      const result = await service.evaluate('git push --force origin main');
      expect(result.action).toBe('blocked');
    });

    it('blocks git push -f', async () => {
      const result = await service.evaluate('git push -f origin main');
      expect(result.action).toBe('blocked');
    });

    it('blocks DROP TABLE', async () => {
      const result = await service.evaluate('DROP TABLE users;');
      expect(result.action).toBe('blocked');
    });

    it('blocks DROP DATABASE', async () => {
      const result = await service.evaluate('DROP DATABASE production;');
      expect(result.action).toBe('blocked');
    });

    it('blocks git reset --hard', async () => {
      const result = await service.evaluate('git reset --hard HEAD~5');
      expect(result.action).toBe('blocked');
    });

    it('returns overrideHash for blocked commands', async () => {
      const result = await service.evaluate('DROP TABLE users;');
      expect(result.overrideHash).toBeDefined();
      expect(result.overrideHash!.length).toBe(12);
    });
  });

  describe('addPattern() — custom denylist', () => {
    it('adds custom pattern that blocks matching commands', async () => {
      await service.addPattern('npm publish', 'Block npm publish');
      service.invalidateCache();
      const result = await service.evaluate('npm publish --access public');
      expect(result.action).toBe('blocked');
    });

    it('rejects ReDoS-prone patterns', async () => {
      // Catastrophic backtracking pattern
      await expect(
        service.addPattern('(a+)+$', 'ReDoS pattern'),
      ).rejects.toThrow(/Invalid regex/);
    });

    it('rejects invalid regex syntax', async () => {
      await expect(
        service.addPattern('[unclosed', 'Invalid regex'),
      ).rejects.toThrow(/Invalid regex/);
    });
  });

  describe('removePattern() — custom pattern removal', () => {
    it('removes a custom pattern', async () => {
      const pattern = await service.addPattern('npm publish', 'Block publish');
      const removed = await service.removePattern(pattern.id);
      expect(removed).toBe(true);
    });

    it('returns false for non-existent pattern', async () => {
      const removed = await service.removePattern('non-existent-id');
      expect(removed).toBe(false);
    });
  });

  describe('processOverride() — RBAC enforcement', () => {
    it('rejects non-admin users', () => {
      const result = service.processOverride('hash123', 'dev-user', 'developer');
      expect(result).toBe(false);
    });

    it('rejects users with no role', () => {
      const result = service.processOverride('hash123', 'anon-user');
      expect(result).toBe(false);
    });

    it('accepts admin users with gateguard_admin role', () => {
      const result = service.processOverride('hash123', 'admin-user', 'gateguard_admin');
      expect(result).toBe(true);
    });
  });

  describe('performance', () => {
    it('evaluate completes in < 50ms', async () => {
      // Warm up cache
      await service.evaluate('echo hello');

      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        await service.evaluate(`echo iteration-${i}`);
      }
      const elapsed = performance.now() - start;
      const avgMs = elapsed / 100;

      expect(avgMs).toBeLessThan(50);
    });
  });
});
