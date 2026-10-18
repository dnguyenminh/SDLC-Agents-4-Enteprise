/**
 * Resource-loader override helpers for the PiAgentSessionHost (SA4E-355):
 * role-scoped skills, conditional AGENTS.md compression, and the fail-open
 * wrapper around every override.
 */
import { compressPrompt } from '../../pi-agent/prompt-compressor.js';
import { RoleScopeFilter, type SkillRef } from '../../pi-agent/role-scope.js';
import { logger } from '../../logger';

/** UC-02/BR-07: role-scoped skills via the existing RoleScopeFilter (wire-only, BR-11). */
export function applyScopedSkills<TSkill extends { name?: string }, TDiag>(
  base: { skills: TSkill[]; diagnostics: TDiag[] },
  role: string | undefined
): { skills: TSkill[]; diagnostics: TDiag[] } {
  const scope = new RoleScopeFilter();
  const refs: SkillRef[] = base.skills.map((s) => ({ id: String(s?.name ?? '') }));
  const allowed = new Set(scope.filterSkills(role ?? '', refs).map((r) => r.id));
  return { ...base, skills: base.skills.filter((s) => allowed.has(String(s?.name ?? ''))) };
}

/** UC-03/BR-04: conditional compression — byte-identical pass-through when not needed. */
export function applyCompressedAgentsFiles<TFile extends { path: string; content: string }>(
  base: { agentsFiles: TFile[] },
  shouldCompress: boolean
): { agentsFiles: TFile[] } {
  if (!shouldCompress) return base;
  return {
    agentsFiles: base.agentsFiles.map((f) => ({ ...f, content: compressPrompt(f.content) }) as TFile),
  };
}

/** EF-1 UC-02: any override failure fails open to the base content + error log. */
export function failOpenOverride<T>(base: T, apply: (base: T) => T, context: string): T {
  try {
    return apply(base);
  } catch (err) {
    logger.error('PI_OVERRIDE_FAILED', { context, error: (err as Error).message });
    return base;
  }
}
