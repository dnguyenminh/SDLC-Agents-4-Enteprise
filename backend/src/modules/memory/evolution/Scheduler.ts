/**
 * Evolution Scheduler — manages background job intervals for decay and stagnation.
 * Exports startScheduler/stopScheduler for integration with MemoryModule lifecycle.
 */

import type Database from 'better-sqlite3';
import type { Logger } from 'pino';
import { DecayService } from './DecayService.js';
import { StagnationDetector } from './StagnationDetector.js';

export interface SchedulerHandles {
  decayTimer: ReturnType<typeof setInterval> | null;
  stagnationTimer: ReturnType<typeof setInterval> | null;
}

const MS_PER_HOUR = 3_600_000;
const STAGNATION_INTERVAL_HOURS = 6;

export function startScheduler(db: Database.Database, logger: Logger): SchedulerHandles {
  const log = logger.child({ service: 'evolution-scheduler' });
  const decaySvc = new DecayService(db, logger);
  const config = decaySvc.getConfig();

  const decayMs = config.decayIntervalHours * MS_PER_HOUR;
  const stagnationMs = STAGNATION_INTERVAL_HOURS * MS_PER_HOUR;

  const decayTimer = setInterval(() => {
    runDecayJob(db, logger, log);
  }, decayMs);

  const stagnationTimer = setInterval(() => {
    runStagnationJob(db, logger, log);
  }, stagnationMs);

  log.info({ decayIntervalH: config.decayIntervalHours, stagnationIntervalH: STAGNATION_INTERVAL_HOURS }, 'Scheduler started');
  return { decayTimer, stagnationTimer };
}

export function stopScheduler(handles: SchedulerHandles): void {
  if (handles.decayTimer) clearInterval(handles.decayTimer);
  if (handles.stagnationTimer) clearInterval(handles.stagnationTimer);
  handles.decayTimer = null;
  handles.stagnationTimer = null;
}

function runDecayJob(db: Database.Database, logger: Logger, log: Logger): void {
  try {
    const svc = new DecayService(db, logger);
    const result = svc.runDecayCycle();
    if (result.decayed_count > 0) {
      log.info(result, 'Scheduled decay cycle completed');
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'JOB_IN_PROGRESS') return;
    log.error({ err: msg }, 'Scheduled decay cycle failed');
  }
}

function runStagnationJob(db: Database.Database, logger: Logger, log: Logger): void {
  try {
    const detector = new StagnationDetector(db, logger);
    const report = detector.analyze();
    if (report.count > 0) {
      log.info({ stagnantCount: report.count }, 'Stagnation detected');
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, 'Stagnation check failed');
  }
}
