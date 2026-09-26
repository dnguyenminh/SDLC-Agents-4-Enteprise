import { describe, it, expect } from 'vitest';
import { RoleScopeFilter, ROLE_SKILL_IDS } from '../role-scope';

const ALL_SKILLS = [
  { id: 'sdlc-brd-skill' },
  { id: 'sdlc-code-skill' },
  { id: 'sdlc-test-skill' },
  { id: 'sdlc-deploy-skill' },
];

describe('RoleScopeFilter', () => {
  // STC: TC-002 — Role-scoped Skill Filtering - SM (SM sees only BRD skill)
  it('SM sees only the BRD skill', () => {
    const filter = new RoleScopeFilter();
    const visible = filter.filterSkills('SM', ALL_SKILLS);
    expect(visible).toEqual([{ id: 'sdlc-brd-skill' }]);
  });

  // STC: TC-003 — Role-scoped Skill Filtering - DEV (DEV sees only code skill)
  it('DEV sees only the code skill', () => {
    const filter = new RoleScopeFilter();
    const visible = filter.filterSkills('DEV', ALL_SKILLS);
    expect(visible).toEqual([{ id: 'sdlc-code-skill' }]);
  });

  // STC: TC-303 — Role Filter Correct Per Role (SM sees BRD, DEV sees code, QA sees test)
  it('QA sees only the test skill', () => {
    const filter = new RoleScopeFilter();
    expect(filter.filterSkills('QA', ALL_SKILLS)).toEqual([{ id: 'sdlc-test-skill' }]);
  });

  it('covers every role with a non-empty allowlist', () => {
    for (const role of Object.keys(ROLE_SKILL_IDS)) {
      expect(ROLE_SKILL_IDS[role].length).toBeGreaterThan(0);
    }
  });

  // STC: TC-402 — Unknown Role (default: unrestricted, tool list not filtered away)
  it('unknown role falls back to default (all skills visible)', () => {
    const filter = new RoleScopeFilter();
    expect(filter.isKnownRole('UNKNOWN')).toBe(false);
    expect(filter.filterSkills('UNKNOWN', ALL_SKILLS)).toEqual(ALL_SKILLS);
  });

  // STC: TC-705 — Role Scope Filter Integration (tool list not polluted across roles)
  it('each role gets a disjoint, non-polluted tool list', () => {
    const filter = new RoleScopeFilter();
    const byRole = {
      SM: filter.filterSkills('SM', ALL_SKILLS).map((s) => s.id),
      DEV: filter.filterSkills('DEV', ALL_SKILLS).map((s) => s.id),
      QA: filter.filterSkills('QA', ALL_SKILLS).map((s) => s.id),
      DevOps: filter.filterSkills('DevOps', ALL_SKILLS).map((s) => s.id),
    };
    expect(byRole.SM).toEqual(['sdlc-brd-skill']);
    expect(byRole.DEV).toEqual(['sdlc-code-skill']);
    expect(byRole.QA).toEqual(['sdlc-test-skill']);
    expect(byRole.DevOps).toEqual(['sdlc-deploy-skill']);
  });

  it('matches skill id segments exactly (no substring false positives)', () => {
    const filter = new RoleScopeFilter();
    expect(filter.isAllowed('DevOps', 'sdlc-dev-skill')).toBe(false);
    expect(filter.isAllowed('DEV', 'sdlc-devops-skill')).toBe(false);
    expect(filter.isAllowed('DEV', 'sdlc-dev-skill')).toBe(true);
  });

  it('supports custom allowlist injection', () => {
    const filter = new RoleScopeFilter({ CUSTOM: ['alpha'] });
    expect(filter.filterSkills('CUSTOM', [{ id: 'alpha-tool' }, { id: 'beta-tool' }])).toEqual([{ id: 'alpha-tool' }]);
  });
});
