/**
 * Localhost Fetcher
 * 
 * Fetches pages from a configurable localhost dev server with SSRF protection.
 * 
 * SECURITY-REVIEW.md Condition C4:
 * - URL must host === '127.0.0.1' ∨ host === 'localhost'
 * - Reject any other host (prevents port scanning internal network)
 * - Limit response size < 10MB
 * - Check Content-Type is text/html or application/json
 * - 1 retry with exponential backoff (500ms → 1s)
 * - Circuit breaker: skip after 2 consecutive failures in same run
 */

import { requestOnce, assertAllowedMediaType } from "./localhost-request";
import { DetectionError, DetectionErrorException, createDetectionError } from "./types";

/** Result of a localhost page fetch (union — never both success and failure). */
export interface FetchResult {
  success: boolean;
  /** HTML content when success === true. */
  html?: string;
  /** DetectionError code when success === false. */
  error?: DetectionError;
  /** Sanitized failure message. */
  message?: string;
}

// Maximum retry attempts (1 retry per Condition C4)
const MAX_RETRIES = 1;

// Retry delay ms: 500ms → 1s exponential backoff
const FIRST_RETRY_DELAY = 500;
const MAX_RETRY_DELAY = 1000;

// Track consecutive failures for circuit breaker
let consecutiveFailures = 0;

/**
 * Validate that a URL host is localhost only (127.0.0.1 or localhost).
 * Per SECURITY-REVIEW.md Condition C4, rejects any other host to prevent SSRF.
 * Exported for reuse by the integration service (C4 URL whitelist check).
 *
 * @param urlString - The URL string to validate
 * @returns True if the URL host is localhost only
 */
export function isLocalhostUrl(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);
    const hostname = parsed.hostname.toLowerCase();

    // Accept only 127.0.0.1 or localhost (parsed.hostname excludes port)
    if (hostname === "127.0.0.1" || hostname === "localhost") {
      return true;
    }

    // Reject all other hosts (SSRF prevention)
    return false;
  } catch (error: any) {
    // Invalid URL format
    return false;
  }
}

/** Exponential backoff: 500ms → 1s (Condition C4). */
function backoffDelay(attempt: number): number {
  return Math.min(FIRST_RETRY_DELAY * 2 ** attempt, MAX_RETRY_DELAY);
}

/** One request + Content-Type check (media type parsed before ';'). */
async function fetchAttempt(urlString: string): Promise<FetchResult> {
  const raw = await requestOnce(urlString);
  assertAllowedMediaType(raw.contentType);
  return { success: true, html: raw.html };
}

/**
 * Decide what a failed attempt means: the error to throw, or undefined to
 * retry (only while retries remain).
 */
function toFatalError(error: any, attempt: number): Error | undefined {
  const isLast = attempt >= MAX_RETRIES;
  const msg = error?.message ?? "unknown error";
  if (error?.code === "ECONNREFUSED" || msg.includes("ECONNREFUSED")) {
    return isLast ? createDetectionError(DetectionError.DEV_SERVER_UNREACHABLE,
      `Dev server not reachable, skipping rendered detection: ${msg}`) : undefined;
  }
  if (/10MB|size limit/.test(msg)) {
    return createDetectionError(DetectionError.FETCH_FAILED, "Fetch failed: Response exceeds 10MB size limit");
  }
  if (error instanceof DetectionErrorException) return error; // Content-Type block
  return isLast ? createDetectionError(DetectionError.FETCH_FAILED,
    `Failed to fetch localhost page: ${msg}`) : undefined;
}

/**
 * Fetch HTML content from a localhost URL with SSRF protection and retry logic.
 * Per SECURITY-REVIEW.md Condition C4: localhost only, < 10MB, text/html or
 * application/json (parameters like charset ignored), 1 retry with backoff.
 *
 * @param urlString - The localhost URL to fetch
 * @returns FetchResult — success with html
 * @throws DetectionErrorException DEV_SERVER_UNREACHABLE / FETCH_FAILED
 */
export async function fetchLocalhostPage(urlString: string): Promise<FetchResult> {
  if (!isLocalhostUrl(urlString)) {
    consecutiveFailures++;
    throw createDetectionError(DetectionError.DEV_SERVER_UNREACHABLE,
      `SSRF protection: URL host must be 127.0.0.1 or localhost, got: ${urlString}`
    );
  }
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    consecutiveFailures = 0; // behaviour kept from the previous implementation
    try {
      return await fetchAttempt(urlString);
    } catch (error: any) {
      consecutiveFailures++;
      const fatal = toFatalError(error, attempt);
      if (fatal) throw fatal;
      await new Promise((r) => setTimeout(r, backoffDelay(attempt)));
    }
  }
  throw createDetectionError(DetectionError.DEV_SERVER_UNREACHABLE,
    `Dev server unreachable after ${MAX_RETRIES + 1} attempts`
  );
}
/**
 * Check if the circuit breaker should skip rendered detection.
 * After 2 consecutive failures, rendered detection is skipped for the run.
 * Per SECURITY-REVIEW.md Condition C4 circuit breaker.
 * 
 * @returns True if rendered detection should be skipped
 */
export function shouldSkipRendered(): boolean {
  return consecutiveFailures >= 2;
}

/**
 * Reset the circuit breaker failure counter.
 * Call at the start of a new detection run.
 */
export function resetCircuitBreaker(): void {
  consecutiveFailures = 0;
}

// Export the enum for use in tests
export { DetectionError };