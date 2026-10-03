/**
 * SA4E-101 — StartupInterruptDetector: runs during server initialization
 * (before accepting HTTP requests). Marks stale `running` records as
 * `interrupted` so the extension can surface a "backend restarted" state
 * instead of a permanently-spinning progress bar.
 *
 * On DB error: logs CRITICAL and continues startup (graceful degradation, EF-04).
 */

import pino from 'pino';
import { IndexOperationRepository } from '../../database/repositories/IndexOperationRepository.js';

const logger = pino({ name: 'startup-interrupt-detector' });

/** Records not updated within this window at boot are considered interrupted. */
const STALE_THRESHOLD_SECONDS = 60;

/**
 * Periodic sweep. The boot pass runs ONCE — an operation killed LESS than
 * STALE_THRESHOLD_SECONDS before the restart was missed forever, leaving
 * `index_operations` stuck at status='running' (owner process is dead).
 * The sweep re-arms the same check every PERIODIC_INTERVAL_MS while running.
 *
 * PERIODIC_STALE_SECONDS is deliberately larger than the boot threshold: during
 * the `scanning` phase no progress events are emitted, so a big workspace can
 * legitimately go minutes without an `updated_at` refresh. 10 minutes bounds
 * the stuck-row lifetime while avoiding false positives on a live run.
 */
const PERIODIC_INTERVAL_MS = 60 * 1000;
const PERIODIC_STALE_SECONDS = 600;

export async function runStartupInterruptDetection(
  staleThresholdSeconds: number = STALE_THRESHOLD_SECONDS,
): Promise<void> {
  try {
    const repo = new IndexOperationRepository();
    const stale = await repo.findStaleRunning(staleThresholdSeconds);
    if (stale.length === 0) {
      logger.info('[startup-interrupt] no stale running operations');
      return;
    }
    for (const op of stale) {
      await repo.updateStatus(op.id, 'interrupted');
    }
    logger.warn(
      { count: stale.length },
      '[startup-interrupt] marked stale running operations as interrupted',
    );
  } catch (err) {
    logger.error(
      { err },
      '[startup-interrupt] CRITICAL: detection failed, continuing startup (graceful degradation)',
    );
  }
}

let periodicTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Shutdown helper: treat EVERY `running` row as stale (threshold 0) so ops
 * owned by this dying process flip to `interrupted` immediately instead of
 * waiting for the next boot/periodic sweep. Like the boot pass, DB errors are
 * swallowed (graceful degradation) — safe to call during teardown.
 */
export async function markInFlightOperationsInterrupted(): Promise<void> {
  await runStartupInterruptDetection(0);
}

/**
 * Start the periodic stale sweep (idempotent). Paired with
 * stopInterruptDetectionScheduler() from HttpServer.stop().
 */
export function startInterruptDetectionScheduler(): void {
  if (periodicTimer) return;
  periodicTimer = setInterval(() => {
    void runStartupInterruptDetection(PERIODIC_STALE_SECONDS);
  }, PERIODIC_INTERVAL_MS);
  logger.info(
    { intervalMs: PERIODIC_INTERVAL_MS, staleSeconds: PERIODIC_STALE_SECONDS },
    '[startup-interrupt] periodic scheduler started',
  );
}

/** Stop the periodic stale sweep (idempotent). */
export function stopInterruptDetectionScheduler(): void {
  if (periodicTimer) {
    clearInterval(periodicTimer);
    periodicTimer = null;
    logger.info('[startup-interrupt] periodic scheduler stopped');
  }
}
