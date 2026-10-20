/**
 * SA4E-167 — GateGuardService unit tests: pattern management, RBAC override,
 * performance.
 * (Split from GateGuardService.test.ts — BR-18 ≤200 lines/file.)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { GateGuardService } from '../GateGuardService.js';
import type { GateGuardRepository } from '../GateGuardRepository.js';
import { MockGateGuardRepository, logger } from './GateGuardService.fixtures.js';

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
