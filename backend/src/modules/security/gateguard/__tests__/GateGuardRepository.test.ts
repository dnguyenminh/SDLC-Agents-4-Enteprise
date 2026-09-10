/**
 * SA4E-167 — GateGuardRepository integration tests (real in-memory SQLite).
 * Covers BR-1204 (append-only audit), pattern CRUD, project scoping.
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { SqliteAdapter } from '../../../../database/adapters/SqliteAdapter.js';
import { GateGuardRepository } from '../GateGuardRepository.js';
import type { DenyPattern } from '../models.js';

let adapter: SqliteAdapter;
let repo: GateGuardRepository;

beforeEach(async () => {
  adapter = new SqliteAdapter(':memory:');
  await adapter.connect();
  repo = new GateGuardRepository(adapter);
  await repo.ensureSchema();
});

afterAll(async () => {
  await adapter?.disconnect();
});

describe('GateGuardRepository — audit log (BR-1204)', () => {
  it('inserts and queryAppend-only audit entries', () => {
    repo.insertAudit({ command: 'rm -rf /', action: 'blocked', patternMatched: 'default-rm-rf', agent: 'test' });
    repo.insertAudit({ command: 'git commit -m ok', action: 'allowed' });

    const entries = repo.queryAudit();
    expect(entries).toHaveLength(2);
    const blocked = entries.find(e => e.action === 'blocked');
    expect(blocked).toBeDefined();
    expect(blocked!.patternMatched).toBe('default-rm-rf');
    expect(blocked!.agent).toBe('test');
    expect(entries.find(e => e.action === 'allowed')).toBeDefined();
  });

  it('filters by project_id', () => {
    repo.insertAudit({ command: 'cmd-a', action: 'blocked', projectId: 'p1' });
    repo.insertAudit({ command: 'cmd-b', action: 'blocked', projectId: 'p2' });

    const entries = repo.queryAudit('p1');
    expect(entries).toHaveLength(1);
    expect(entries[0].command).toBe('cmd-a');
  });

  it('filters by action and respects limit', () => {
    repo.insertAudit({ command: 'cmd-1', action: 'blocked' });
    repo.insertAudit({ command: 'cmd-2', action: 'allowed' });
    repo.insertAudit({ command: 'cmd-3', action: 'blocked' });
    repo.insertAudit({ command: 'cmd-4', action: 'blocked' });

    expect(repo.queryAudit(undefined, 2)).toHaveLength(2);
    expect(repo.queryAudit(undefined, 50, 'blocked')).toHaveLength(3);
    expect(repo.queryAudit(undefined, 50, 'allowed')).toHaveLength(1);
  });
});

describe('GateGuardRepository — denylist patterns', () => {
  it('adds and lists custom patterns with project scoping', () => {
    const global: DenyPattern = { id: 'c1', regex: 'npm publish', description: '', isDefault: false };
    const scoped: DenyPattern = { id: 'c2', regex: 'kubectl replace', description: '', isDefault: false, projectId: 'p1' };
    repo.addPattern(global);
    repo.addPattern(scoped);

    expect(repo.getPatterns('p1').map(p => p.id).sort()).toEqual(['c1', 'c2']);
    expect(repo.getPatterns('p2').map(p => p.id)).toEqual(['c1']);
  });

  it('removes only non-default patterns', () => {
    repo.addPattern({ id: 'c1', regex: 'npm publish', description: '', isDefault: false });
    repo.addPattern({ id: 'def1', regex: 'git push --force.*', description: '', isDefault: true });

    expect(repo.removePattern('def1')).toBe(false);
    expect(repo.removePattern('missing')).toBe(false);
    expect(repo.removePattern('c1')).toBe(true);
    expect(repo.removePattern('c1')).toBe(false);
  });
});