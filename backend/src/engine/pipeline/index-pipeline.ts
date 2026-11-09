/**
 * SA4E-414 — SnapshotIndexPipeline: ordered, gated, language-isolated
 * indexing pipeline over an immutable code_index_snapshot (16K Doc §9).
 *
 * Failure semantics:
 *  - A REGISTERED single stage throwing (or returning FAILED) is a HARD
 *    failure → remaining stages aborted, snapshot = FAILED (all-or-nothing).
 *  - A stage without a registered handler is SKIPPED (capability not wired in
 *    this deployment) — recorded, never blocks the rest (graceful degradation).
 *  - Language-scoped failure in E/F is soft: recorded in coverage, other
 *    languages continue; snapshot publishes READY with capability metadata.
 *
 * Stage J is owned by this orchestrator: it flips snapshot status exactly once
 * (BUILDING → READY|FAILED) — the atomic publication boundary.
 */

import type { QueryDatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import pino from 'pino';
import {
  capabilityFor,
  PER_LANGUAGE_STAGES,
  PIPELINE_STAGES,
  type LanguageCoverage,
  type PipelineHandlers,
  type PipelineRunResult,
  type PipelineStage,
  type PipelineStageContext,
  type StageHandler,
  type StageOutcome,
} from './pipeline-types.js';

const logger = pino({ name: 'index-pipeline' });

interface LangState {
  E?: StageOutcome;
  F?: StageOutcome;
}

export class SnapshotIndexPipeline {
  private readonly langState = new Map<string, LangState>();
  private readonly stageOutcomes: Partial<Record<PipelineStage, StageOutcome>> = {};
  private readonly completed: PipelineStage[] = [];
  private hardFailure: StageOutcome | null = null;
  constructor(
    private readonly db: QueryDatabaseAdapter,
    private readonly handlers: PipelineHandlers,
    private readonly target: { projectId: string; repositoryId: string; commitId: string; snapshotId: string },
    private readonly languages: string[] = [],
  ) {}

  async run(): Promise<PipelineRunResult> {
    await this.markSnapshot('BUILDING');
    for (const stage of PIPELINE_STAGES) {
      if (stage === 'J_ATOMIC_PUBLISH') continue; // owned by publish()
      const outcome = await this.runStage(stage);
      this.stageOutcomes[stage] = outcome;
      if (outcome.status === 'FAILED') {
        this.hardFailure = outcome;
        break;
      }
      this.completed.push(stage);
    }
    const coverage = this.buildCoverage();
    const result: PipelineRunResult = {
      snapshotStatus: this.hardFailure ? 'FAILED' : 'READY',
      stageOutcomes: this.stageOutcomes,
      coverage,
    };
    await this.publish(result, coverage);
    return result;
  }

  private async runStage(stage: PipelineStage): Promise<StageOutcome> {
    const binding = this.handlers[stage];
    if (!binding) {
      // Capability not wired in this deployment — graceful skip, never blocks.
      if (PER_LANGUAGE_STAGES.has(stage)) {
        const outcome: StageOutcome = { status: 'SKIPPED', detail: 'no handler registered' };
        for (const language of this.languages) {
          const state = this.langState.get(language) ?? {};
          if (stage === 'E_DEPENDENCY_RESOLUTION') state.E = outcome;
          if (stage === 'F_SEMANTIC_INDEX') state.F = outcome;
          this.langState.set(language, state);
        }
      }
      return { status: 'SKIPPED', detail: 'no handler registered' };
    }
    if (binding.kind === 'single') {
      return this.runSingle(stage, binding.handler);
    }
    return this.runPerLanguage(stage, binding.handlers);
  }

  private async runSingle(stage: PipelineStage, handler: (ctx: PipelineStageContext) => Promise<StageOutcome>): Promise<StageOutcome> {
    try {
      return await handler(this.ctx());
    } catch (err) {
      logger.warn({ err, stage }, '[pipeline] single-stage failure');
      return { status: 'FAILED', detail: String((err as Error)?.message ?? err) };
    }
  }

  /** Per-language isolation: one language's failure never aborts the others. */
  private async runPerLanguage(
    stage: PipelineStage,
    handlers: Record<string, StageHandler>,
  ): Promise<StageOutcome> {
    const failures: string[] = [];
    const skipped: string[] = [];
    for (const language of this.languages) {
      const state = this.langState.get(language) ?? {};
      const handler = handlers[language];
      let outcome: StageOutcome;
      if (!handler) {
        outcome = { status: 'SKIPPED', detail: 'no handler for language' };
        skipped.push(language);
      } else if (!this.gateAllows(stage, language)) {
        outcome = { status: 'SKIPPED', detail: 'gating: prerequisite failed for language' };
        skipped.push(language);
      } else {
        try {
          outcome = await handler(this.ctx());
        } catch (err) {
          logger.warn({ err, stage, language }, '[pipeline] language-scoped failure');
          outcome = { status: 'FAILED', detail: String((err as Error)?.message ?? err) };
          failures.push(language);
        }
      }
      if (stage === 'E_DEPENDENCY_RESOLUTION') state.E = outcome;
      if (stage === 'F_SEMANTIC_INDEX') state.F = outcome;
      this.langState.set(language, state);
    }
    const parts = [failures.length ? `failures: ${failures.join(',')}` : '', skipped.length ? `skipped: ${skipped.join(',')}` : '']
      .filter(Boolean)
      .join(' | ');
    return { status: 'OK', detail: parts || undefined };
  }

  /** F (semantic binding) requires E (dependency resolution) OK for the same language. */
  private gateAllows(stage: PipelineStage, language: string): boolean {
    if (stage !== 'F_SEMANTIC_INDEX') return true;
    const e = this.langState.get(language)?.E;
    return e?.status === 'OK';
  }

  private ctx(): PipelineStageContext {
    return {
      projectId: this.target.projectId,
      repositoryId: this.target.repositoryId,
      commitId: this.target.commitId,
      snapshotId: this.target.snapshotId,
      completed: [...this.completed],
      languageOutcomes: this.langState,
    };
  }

  private buildCoverage(): LanguageCoverage[] {
    const rows: LanguageCoverage[] = [];
    for (const language of this.languages) {
      const state = this.langState.get(language) ?? {};
      rows.push({
        language,
        capability: capabilityFor(state.E, state.F),
        detail: [state.E?.detail, state.F?.detail].filter(Boolean).join('; ') || undefined,
      });
    }
    return rows;
  }

  private async publish(result: PipelineRunResult, coverage: LanguageCoverage[]): Promise<void> {
    const jBinding = this.handlers.J_ATOMIC_PUBLISH;
    if (jBinding?.kind === 'single') {
      const outcome = await this.runSingle('J_ATOMIC_PUBLISH', jBinding.handler);
      this.stageOutcomes.J_ATOMIC_PUBLISH = outcome;
      if (outcome.status === 'FAILED') logger.error('[pipeline] custom publication failed');
      return;
    }
    this.stageOutcomes.J_ATOMIC_PUBLISH = { status: 'OK' };
    const diagnostics = JSON.stringify({ stages: this.stageOutcomes, coverage });
    if (result.snapshotStatus === 'READY') {
      const manifest = JSON.stringify({ coverage });
      await this.db.runAsync(
        `UPDATE code_index_snapshot SET status = 'READY', toolchain_manifest = ?, diagnostics = ? WHERE id = ?`,
        [manifest, diagnostics, this.target.snapshotId],
      );
    } else {
      await this.db.runAsync(
        `UPDATE code_index_snapshot SET status = 'FAILED', diagnostics = ? WHERE id = ?`,
        [diagnostics, this.target.snapshotId],
      );
    }
  }

  private async markSnapshot(status: 'BUILDING'): Promise<void> {
    await this.db.runAsync(
      `UPDATE code_index_snapshot SET status = ? WHERE id = ?`,
      [status, this.target.snapshotId],
    );
  }
}
