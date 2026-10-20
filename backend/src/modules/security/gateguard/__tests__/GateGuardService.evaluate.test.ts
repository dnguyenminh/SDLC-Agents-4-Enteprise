/**
 * SA4E-167 — GateGuardService unit tests: evaluate() incl. SA4E-335 container
 * data destruction parity (closes SEC-06).
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

  describe('evaluate() — SA4E-335 container data destruction (closes SEC-06 parity)', () => {
    it.each([
      'docker compose -f docker-compose.yml down -v',
      'docker compose down --volumes',
      'docker volume rm backend_postgres_data',
      'docker volume prune -f',
      'docker system prune',
      'docker system prune -af',
      'docker rm -f sa4e-postgres',
    ])('blocks %s', async (command) => {
      const result = await service.evaluate(command);
      expect(result.action, command).toBe('blocked');
      expect(result.patternMatched, command).toBeDefined();
    });

    it.each([
      'docker ps',
      'docker run --rm nginx',
      'docker compose up -d',
      'docker compose config',
    ])('allows %s (no over-block)', async (command) => {
      const result = await service.evaluate(command);
      expect(result.action, command).toBe('allowed');
    });

    it('is segment-bounded: a benign `docker compose down` before another echo is not blocked', async () => {
      const result = await service.evaluate('echo docker compose down; echo -v');
      expect(result.action).toBe('allowed');
    });

    it('still blocks the destructive segment of a compound command', async () => {
      const result = await service.evaluate('echo starting; docker compose down -v');
      expect(result.action).toBe('blocked');
    });
  });
});
