export interface SkillRef {
  id: string;
  phase?: string;
}

export const ROLE_SKILL_IDS: Record<string, string[]> = {
  SM: ['sm', 'brd', 'sprint', 'backlog', 'coordination'],
  BA: ['ba', 'brd', 'fsd', 'requirement', 'specification'],
  SA: ['sa', 'tdd', 'design', 'architecture', 'discrepancy'],
  DEV: ['dev', 'code', 'implement', 'build'],
  QA: ['qa', 'test', 'quality', 'stp', 'stc'],
  DevOps: ['devops', 'deploy', 'release', 'pipeline', 'ci', 'cd'],
  UI: ['ui', 'ux', 'wireframe'],
  Security: ['security', 'pentest', 'vulnerability'],
};

export class RoleScopeFilter {
  constructor(private readonly allowlist: Record<string, string[]> = ROLE_SKILL_IDS) {}

  isKnownRole(role: string): boolean {
    return Array.isArray(this.allowlist[role]);
  }

  isAllowed(role: string, skillId: string): boolean {
    if (!this.isKnownRole(role)) return true;
    const segments = skillId.toLowerCase().split(/[-_.\s]+/).filter(Boolean);
    return this.allowlist[role].some((token) => segments.includes(token));
  }

  filterSkills(role: string, skills: SkillRef[]): SkillRef[] {
    return skills.filter((s) => this.isAllowed(role, s.id));
  }
}
