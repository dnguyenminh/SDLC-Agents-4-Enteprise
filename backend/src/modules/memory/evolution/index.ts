/**
 * Barrel export for the evolution module.
 */

export type {
  ScoringStrategy,
  ScoringContext,
  ScoreBreakdown,
  CompositeResult,
  CompositeScoreOptions,
} from './models.js';

export { createEmptyBreakdown } from './models.js';
export { CompositeScorer } from './CompositeScorer.js';
export { OutcomeService } from './OutcomeService.js';
export { DecayService } from './DecayService.js';
export type { DecayConfig, DecayCycleResult } from './DecayService.js';
export { StagnationDetector } from './StagnationDetector.js';
export type { StagnationReport, StagnantQuery } from './StagnationDetector.js';
export { EpochService } from './EpochService.js';
export type { EpochTriggerResult, EpochStatus } from './EpochService.js';
export { TemporalStrategy } from './strategies/TemporalStrategy.js';
export { ConfidenceStrategy } from './strategies/ConfidenceStrategy.js';
export { SupersededStrategy } from './strategies/SupersededStrategy.js';
export { OutcomeStrategy } from './strategies/OutcomeStrategy.js';
export { PredictiveStrategy } from './strategies/PredictiveStrategy.js';
export { startScheduler, stopScheduler } from './Scheduler.js';
export type { SchedulerHandles } from './Scheduler.js';
