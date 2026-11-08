/**
 * SA4E-414 — 16K Indexing Pipeline: stage registry + contracts (16K Doc §9).
 *
 * Pipeline order (must execute in this sequence):
 *   A repo/revision discovery → B file inventory → C module config →
 *   D syntax (Tree-sitter) → E dependency/toolchain resolution →
 *   F semantic binding → G graph reconcile → H chunk & embed →
 *   I validation → J atomic publication.
 *
 * Key rules (Jira SA4E-414):
 *  - D (syntax) may run before E; F (semantic) MUST wait for E per language.
 *  - E/F are language-scoped: a resolver failure for language X never blocks
 *    language Y (non-blocking rule).
 *  - Capability/coverage metadata is published per language
 *    (supported | partial | unsupported | failed).
 *  - Publication (J) is all-or-nothing per snapshot (status flips once).
 */

export const PIPELINE_STAGES = [
  'A_REPO_DISCOVERY',
  'B_FILE_INVENTORY',
  'C_MODULE_CONFIG',
  'D_SYNTAX_INDEX',
  'E_DEPENDENCY_RESOLUTION',
  'F_SEMANTIC_INDEX',
  'G_GRAPH_RECONCILE',
  'H_CHUNK_EMBED',
  'I_VALIDATION',
  'J_ATOMIC_PUBLISH',
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

/** Stages whose handlers are registered per language (E, F per 16K Doc §9). */
export const PER_LANGUAGE_STAGES: ReadonlySet<PipelineStage> = new Set([
  'E_DEPENDENCY_RESOLUTION',
  'F_SEMANTIC_INDEX',
] as PipelineStage[]);

export type LanguageCapability = 'supported' | 'partial' | 'unsupported' | 'failed';

export interface LanguageCoverage {
  language: string;
  capability: LanguageCapability;
  detail?: string;
}

export interface StageOutcome {
  status: 'OK' | 'SKIPPED' | 'FAILED';
  detail?: string;
}

export interface PipelineStageContext {
  projectId: string;
  repositoryId: string;
  commitId: string;
  snapshotId: string;
  /** Stages that completed (OK/SKIPPED) before the current one. */
  completed: readonly PipelineStage[];
  /** Per-language outcomes of E/F so far (gating input for F). */
  languageOutcomes: ReadonlyMap<string, { E?: StageOutcome; F?: StageOutcome }>;
}

export type StageHandler = (ctx: PipelineStageContext) => Promise<StageOutcome>;

export type StageBinding =
  | { kind: 'single'; handler: StageHandler }
  | { kind: 'per-language'; handlers: Record<string, StageHandler> };

export type PipelineHandlers = Partial<Record<PipelineStage, StageBinding>>;

export interface PipelineTarget {
  projectId: string;
  repositoryId: string;
  commitId: string;
  snapshotId: string;
}

export interface PipelineRunResult {
  snapshotStatus: 'READY' | 'FAILED';
  stageOutcomes: Partial<Record<PipelineStage, StageOutcome>>;
  coverage: LanguageCoverage[];
}

/** Languages with no per-language handler at all. */
export function capabilityFor(
  eOutcome: StageOutcome | undefined,
  fOutcome: StageOutcome | undefined,
): LanguageCapability {
  if (!eOutcome || eOutcome.status === 'SKIPPED') return 'unsupported';
  if (eOutcome.status === 'FAILED') return 'failed';
  // E OK from here — semantic binding determines supported vs partial.
  if (!fOutcome || fOutcome.status !== 'OK') return 'partial';
  return 'supported';
}
