/**
 * Retry-with-backoff for single-rule ingest (Fix 5).
 *
 * Retries ONLY transient faults — a server-closed socket (UND_ERR_SOCKET),
 * connection reset/timeout, or a backend-classified `retryable` rejection
 * (DB_TRANSIENT, too_many_connections, deadlock…). Permanent faults (validation,
 * missing checksum, auth) fail fast on the first attempt — retrying them only
 * hammers an already-struggling backend.
 */

import { IngestRejectedError, IngestAuthError } from "./ingest-auth";
import { isTransientFetchError } from "../../utils/http-client-utils";
import type { LogFn } from "./ingest-types";

/** Retry tuning — exponential backoff with jitter. */
export interface RetryConfig {
  maxAttempts: number;   // total attempts including the first (e.g. 3 = 1 try + 2 retries)
  baseDelayMs: number;   // first backoff delay; doubles each retry
  maxDelayMs: number;    // cap so a late retry never stalls the pipeline
}

export const DEFAULT_INGEST_RETRY: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 5_000,
};

/** Is this error worth another attempt? Auth is never retried (handled upstream). */
export function isRetryableIngestError(err: unknown): boolean {
  if (err instanceof IngestAuthError) { return false; }
  if (err instanceof IngestRejectedError) { return err.retryable; }
  // Network/socket faults (fetch threw) — UND_ERR_SOCKET & friends.
  return isTransientFetchError(err);
}

/** Exponential backoff with full jitter, capped at maxDelayMs. */
function backoffDelay(attempt: number, cfg: RetryConfig): number {
  const exp = Math.min(cfg.maxDelayMs, cfg.baseDelayMs * 2 ** (attempt - 1));
  return Math.floor(Math.random() * exp); // full jitter — spreads concurrent retries
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Run `op` with retry-on-transient. Re-throws the last error when attempts are
 * exhausted or the error is permanent, so existing catch/skip logic still runs.
 * @param op - The ingest operation (one POST + envelope parse).
 * @param cfg - Retry tuning.
 * @param log - Optional logger for retry visibility.
 * @param describe - Optional one-line identity (rule key) for the retry log.
 */
export async function withIngestRetry<T>(
  op: () => Promise<T>,
  cfg: RetryConfig,
  log?: LogFn,
  describe?: string,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= cfg.maxAttempts; attempt++) {
    try {
      return await op();
    } catch (err) {
      lastErr = err;
      if (!isRetryableIngestError(err) || attempt === cfg.maxAttempts) { throw err; }
      const delay = backoffDelay(attempt, cfg);
      log?.(`[Pega Ingester] 🔁 Transient ingest fault — retry ${attempt}/${cfg.maxAttempts - 1} in ${delay}ms${describe ? ` | ${describe}` : ""}`);
      await sleep(delay);
    }
  }
  throw lastErr; // unreachable — loop either returns or throws
}
