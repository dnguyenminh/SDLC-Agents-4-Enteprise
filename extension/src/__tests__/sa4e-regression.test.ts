/**
 * SA4E-429 — SA4E regression: SM pipeline phase contract and agent role
 * boundaries (AGENTS.md + .opencode/rules/sdlc/role-boundaries.md).
 *
 * The SM pipeline E2E itself lives in
 * `src/pi-workflow/__tests__/pi-workflow-e2e.integration.test.ts` and is part of
 * the `test:regression` gate. This file guards the two contracts the 16K work
 * must not drift: the 7-phase order and the per-agent allowed/forbidden outputs.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PhaseRouter, VALID_PHASES } from '../pi-workflow/phase-router';
import { RoleScopeFilter, ROLE_SKILL_IDS } from '../pi-agent/role-scope';

const CANONICAL_PHASES = [
  'requirements',
  'specification',
  'design',
  'test_planning',
  'implementation',
  'testing',
  'deployment',
  'completed',
] as const;

const MATRIX_AGENTS = [
  'sm-agent',
  'ba-agent',
  'ta-agent',
  'sa-agent',
  'qa-agent',
  'dev-agent',
  'devops-agent',
  'ui-agent',
  'security-agent',
] as const;

/** Resolve the repository root from either extension/ or repo-root cwd. */
function repoRoot(): string {
  const candidates = [process.cwd(), path.resolve(process.cwd(), '..')];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, '.opencode', 'rules', 'sdlc', 'role-boundaries.md'))) {
      return candidate;
    }
  }
  throw new Error('repository root with .opencode/rules/sdlc/role-boundaries.md not found');
}

interface MatrixRow {
  agent: string;
  creates: string;
  reads: string;
  cannot: string;
}

function parseRoleMatrix(): MatrixRow[] {
  const file = path.join(repoRoot(), '.opencode', 'rules', 'sdlc', 'role-boundaries.md');
  return fs
    .readFileSync(file, 'utf-8')
    .split(/\r?\n/)
    .filter((line) => /^\|\s*\*\*[a-z-]+-agent\*\*\s*\|/.test(line))
    .map((line) => {
      const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
      return {
        agent: cells[0].replace(/\*\*/g, ''),
        creates: cells[1],
        reads: cells[2],
        cannot: cells[3].replace(/^❌\s*/, ''),
      };
    });
}

/** Case-insensitive artifact presence, e.g. `code` must not match `encode`. */
function mentions(text: string, artifact: string): boolean {
  return new RegExp(`\\b${artifact.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text);
}

describe('SA4E-429 SM pipeline phase contract', () => {
  it('exposes the 7 SDLC phases plus completed in canonical order', () => {
    expect([...VALID_PHASES]).toEqual([...CANONICAL_PHASES]);
  });

  it('PhaseRouter advances requirements → … → deployment → completed', async () => {
    const router = new PhaseRouter();
    let state: { currentPhase: string } = { currentPhase: 'requirements' };

    for (const expected of CANONICAL_PHASES.slice(1)) {
      const result = await router.routePhase(state, { action: 'proceed' });
      expect(result.errors).toEqual([]);
      expect(result.nextPhase).toBe(expected);
      state = result.updatedState as { currentPhase: string };
    }
  });

  it('abort keeps the current phase and marks the pipeline HALTED', async () => {
    const router = new PhaseRouter();
    const result = await router.routePhase(
      { currentPhase: 'implementation' },
      { action: 'abort', reason: 'QA regression' },
    );
    expect(result.nextPhase).toBe('implementation');
    expect(result.updatedState).toMatchObject({ pipelineStatus: 'HALTED', haltReason: 'QA regression' });
  });
});

describe('SA4E-429 agent role boundaries', () => {
  const rows = parseRoleMatrix();
  const byAgent = new Map(rows.map((row) => [row.agent, row]));

  it('the responsibility matrix covers every agent with allowed + forbidden scopes', () => {
    expect(rows.map((row) => row.agent).sort()).toEqual([...MATRIX_AGENTS].sort());
    for (const row of rows) {
      expect(row.creates, `${row.agent} creates`).not.toBe('');
      expect(row.cannot, `${row.agent} cannot`).not.toBe('');
    }
  });

  it('every matrix role maps to a real agent prompt with a description', () => {
    for (const agent of MATRIX_AGENTS) {
      const promptFile = path.join(repoRoot(), '.opencode', 'agents', `${agent}.md`);
      expect(fs.existsSync(promptFile), `${agent}.md exists`).toBe(true);
      expect(fs.readFileSync(promptFile, 'utf-8')).toMatch(/^description:\s*\S+/m);
    }
  });

  it('SM prompt enforces coordinator-only role separation', () => {
    const sm = fs.readFileSync(path.join(repoRoot(), '.opencode', 'agents', 'sm-agent.md'), 'utf-8');
    expect(sm).toContain('HARD RULE: Role Separation');
    expect(sm).toContain('COORDINATOR');
    expect(sm).toMatch(/NEVER write documents yourself/i);
  });

  it('each role never both creates and forbids the same artifact', () => {
    const artifacts = ['BRD', 'FSD', 'TDD', 'STP', 'STC', 'DPG', 'RLN', 'code', 'tests', 'diagrams'];
    for (const row of rows) {
      for (const artifact of artifacts) {
        if (mentions(row.creates, artifact)) {
          expect(mentions(row.cannot, artifact), `${row.agent} creates ${artifact} but forbids it`).toBe(false);
        }
      }
    }
  });

  it('keeps the critical cross-agent guards from AGENTS.md', () => {
    expect(byAgent.get('ba-agent')!.creates).toMatch(/BRD/);
    expect(byAgent.get('ba-agent')!.cannot).toMatch(/TDD/);

    expect(byAgent.get('sa-agent')!.creates).toMatch(/TDD/);
    expect(byAgent.get('sa-agent')!.cannot).toMatch(/BRD/);

    expect(byAgent.get('dev-agent')!.creates).toMatch(/code/i);
    expect(byAgent.get('dev-agent')!.cannot).toMatch(/BRD/);
    expect(byAgent.get('dev-agent')!.cannot).toMatch(/TDD/);

    expect(byAgent.get('qa-agent')!.creates).toMatch(/STP/);
    expect(byAgent.get('qa-agent')!.cannot).toMatch(/production code/);

    expect(byAgent.get('devops-agent')!.creates).toMatch(/DPG/);
    expect(byAgent.get('devops-agent')!.cannot).toMatch(/application code/);

    expect(byAgent.get('sm-agent')!.cannot).toMatch(/documents/);
    expect(byAgent.get('sm-agent')!.cannot).toMatch(/code/);
  });

  it('role-scope filtering covers the operating roles and fails open for unknown ones', () => {
    const filter = new RoleScopeFilter();
    for (const role of ['SM', 'BA', 'SA', 'DEV', 'QA', 'DevOps', 'UI', 'Security']) {
      expect(filter.isKnownRole(role), `${role} known`).toBe(true);
      expect(ROLE_SKILL_IDS[role].length).toBeGreaterThan(0);
    }
    const all = [{ id: 'sm-coordination' }, { id: 'dev-code' }];
    expect(filter.filterSkills('UNKNOWN_ROLE', all)).toEqual(all);
  });
});
