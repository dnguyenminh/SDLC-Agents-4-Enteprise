import { logger } from '../logger';
import type { ContextBudget } from './models/ContextBudget';
import { compressPrompt, estimateTokenCount, NON_STRIPPABLE_RE } from './prompt-compressor';
import { RoleScopeFilter } from './role-scope';

/**
 * Phase → required steering file basenames (FSD §3.2.4 — initial mapping,
 * adjustable by config). Files of other mapped phases are NOT loaded.
 */
export const PHASE_STEERING_FILES: Record<string, string[]> = {
  requirements: ['phase-1-requirements.md'],
  specification: ['phase-2-specification.md'],
  design: ['phase-3-design.md'],
  'test-planning': ['phase-4-test-planning.md'],
  implementation: ['phase-5-implementation.md'],
  testing: ['phase-6-testing.md'],
  deployment: ['phase-7-deployment.md'],
};

/** Governance-critical shared steering — highest steering priority (dropped last). */
const GOVERNANCE_STEERING_RE = /^shared-(quality|security|governance)[a-z0-9-]*\.md$/i;

/** Steering file identity pattern: `phase-N-name.md` or `shared-name.md`. */
const STEERING_FILE_RE = /(?:phase-\d-[a-z0-9-]+|shared-[a-z0-9-]+)\.md/i;

/** Drop priority: 0 = never dropped (non-steering); 3 = dropped first. */
const PRIORITY_NEVER_DROP = 0;
const PRIORITY_GOVERNANCE = 1;
const PRIORITY_PHASE_FILE = 2;
const PRIORITY_OTHER_STEERING = 3;

/** Options for {@link scopedSteering}. */
export interface ScopedSteeringOptions {
  /** UC-03 step 6 / BR-04: apply conditional compression to kept steering entries. */
  compress?: boolean;
}

interface ScopedEntry {
  content: string;
  fileName: string | null;
  priority: number;
  index: number;
}

/**
 * Phase-scopes, caps and (optionally) compresses the appendSystemPrompt steering
 * entries (UC-02 / UC-03 step 6). Wire-only composition of RoleScopeFilter,
 * compressPrompt and estimateTokenCount (BR-11) — no new algorithms.
 *
 * - Unknown role → base returned unchanged (BR-07 fail-open).
 * - Unmapped phase → shared-* steering only + info log (FSD §3.2.4).
 * - Over staticBudget cap → lowest-priority steering dropped first (BR-03 share).
 * - `NON_STRIPPABLE_RE` lines of dropped files always survive (BR-05).
 * - Any internal failure → base returned unchanged + error log (EF-1 UC-02).
 */
export function scopedSteering(
  base: string[],
  role: string | undefined,
  phase: string | undefined,
  budget: ContextBudget,
  options?: ScopedSteeringOptions
): string[] {
  try {
    if (!new RoleScopeFilter().isKnownRole(role ?? '')) return base; // BR-07 fail-open
    const scoped = scopeByPhase(base, phase);
    const compress = options?.compress === true;
    const entries = scoped.kept.map((content, i) => toScopedEntry(content, phase, compress, i));
    return capToBudget(entries, scoped.securityLines, budget.staticBudget);
  } catch (err) {
    logger.error('PI_STEERING_SCOPE_FAILED', { error: (err as Error).message }); // EF-1 UC-02
    return base;
  }
}

/** Extracts the steering file identity from an entry, or null for non-steering content. */
function steeringFileName(entry: string): string | null {
  const match = typeof entry === 'string' ? STEERING_FILE_RE.exec(entry) : null;
  return match ? match[0].toLowerCase() : null;
}

/** Keeps shared-*, current-phase and non-steering entries; collects security lines of drops. */
function scopeByPhase(base: string[], phase: string | undefined): { kept: string[]; securityLines: string[] } {
  const key = (phase ?? '').trim();
  const required = PHASE_STEERING_FILES[key];
  if (!required) logger.info('PI_STEERING_PHASE_UNMAPPED', { phase: key }); // AF-2 UC-02
  const kept: string[] = [];
  const securityLines: string[] = [];
  for (const entry of base) {
    const fileName = steeringFileName(entry);
    if (fileName === null || fileName.startsWith('shared-') || required?.includes(fileName)) {
      kept.push(entry); // non-steering, shared, or current-phase — always kept here
      continue;
    }
    if (isMappedPhaseFile(fileName)) securityLines.push(...securityLinesOf(entry)); // out-of-phase drop
    else kept.push(entry); // unknown steering file — fail-open keep
  }
  return { kept, securityLines };
}

/** True when the file belongs to ANY mapped phase (i.e. is explicitly out-of-phase). */
function isMappedPhaseFile(fileName: string): boolean {
  return Object.values(PHASE_STEERING_FILES).some((files) => files.includes(fileName));
}

/** Lines of an entry that must survive every trim (BR-05 / SEC-326-04). */
function securityLinesOf(entry: string): string[] {
  return entry.split('\n').filter((line) => NON_STRIPPABLE_RE.test(line));
}

/** Wraps a kept entry with its steering identity, priority and (optional) compressed content. */
function toScopedEntry(content: string, phase: string | undefined, compress: boolean, index: number): ScopedEntry {
  const fileName = steeringFileName(content);
  const effective = compress && fileName !== null ? compressPrompt(content) : content; // BR-15 non-worsening
  return { content: effective, fileName, priority: priorityOf(fileName, phase), index };
}

/** Drop priority: governance shared > current-phase file > other steering; non-steering never. */
function priorityOf(fileName: string | null, phase: string | undefined): number {
  if (fileName === null) return PRIORITY_NEVER_DROP;
  if (GOVERNANCE_STEERING_RE.test(fileName)) return PRIORITY_GOVERNANCE;
  const required = PHASE_STEERING_FILES[(phase ?? '').trim()] ?? [];
  return required.includes(fileName) ? PRIORITY_PHASE_FILE : PRIORITY_OTHER_STEERING;
}

/** Drops lowest-priority steering until within cap; appends preserved security lines. */
function capToBudget(entries: ScopedEntry[], scopeSecurityLines: string[], cap: number): string[] {
  const dropped: ScopedEntry[] = [];
  while (totalTokens(entries) > cap && entries.some((e) => e.priority !== PRIORITY_NEVER_DROP)) {
    const victim = lowestPriorityEntry(entries);
    entries.splice(entries.indexOf(victim), 1);
    dropped.push(victim);
  }
  const preserved = [...scopeSecurityLines, ...dropped.flatMap((e) => securityLinesOf(e.content))];
  const output = entries.map((e) => e.content);
  if (preserved.length > 0) output.push(preserved.join('\n')); // BR-05: never lose directives
  logCapOutcome(dropped.length, output, cap);
  return output;
}

/** The most expendable droppable entry: highest priority number, then latest in base order. */
function lowestPriorityEntry(entries: ScopedEntry[]): ScopedEntry {
  const droppable = entries.filter((e) => e.priority !== PRIORITY_NEVER_DROP);
  return droppable.reduce((worst, e) => (e.priority > worst.priority || (e.priority === worst.priority && e.index > worst.index) ? e : worst));
}

/** Sum of estimated tokens (chars/4) across entries. */
function totalTokens(entries: ScopedEntry[]): number {
  return entries.reduce((sum, e) => sum + estimateTokenCount(e.content), 0);
}

/** Observability (TDD §9): counts only — never file contents. */
function logCapOutcome(droppedCount: number, output: string[], cap: number): void {
  const remaining = output.reduce((sum, e) => sum + estimateTokenCount(e), 0);
  if (droppedCount > 0) logger.info('PI_STEERING_CAPPED', { dropped: droppedCount, remainingTokens: remaining, cap });
  if (remaining > cap) logger.warn('PI_STEERING_OVER_CAP', { tokens: remaining, cap }); // gate owns the rest
}
