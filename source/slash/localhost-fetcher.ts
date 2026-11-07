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

import * as http from "http";
import * as https from "https";
import * as stream from "stream";

import { DetectionError, Finding } from "./types";

// Response size limit per Condition C4
const MAX_RESPONSE_SIZE = 10 * 1024 * 1024; // 10MB

// Timeout for fetch requests (per Condition C4: 10s)
const FETCH_TIMEOUT = 10000;

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
 * 
 * @param urlString - The URL string to validate
 * @returns True if the URL host is localhost only
 */
function isLocalhostUrl(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);
    const host = parsed.host.toLowerCase();

    // Accept only 127.0.0.1 or localhost
    if (host === "127.0.0.1" || host === "localhost") {
      return true;
    }

    // Reject all other hosts (SSRF prevention)
    return false;
  } catch (error: any) {
    // Invalid URL format
    return false;
  }
}

/**
 * Fetch HTML content from a localhost URL with SSRF protection and retry logic.
 * Per SECURITY-REVIEW.md Condition C4:
 * - URL must be localhost (127.0.0.1 or localhost)
 * - Response size < 10MB
 * - Content-Type must be text/html or application/json
 * - 1 retry with exponential backoff
 * 
 * @param urlString - The localhost URL to fetch
 * @returns HTML content as string
 * @throws DetectionError.DEV_SERVER_UNREACHABLE if fetch fails after retries
 * @throws DetectionError.FETCH_FAILED if CORS or other fetch error
 */
export async function fetchLocalhostPage(
  urlString: string
): Promise<{ success: true; html: string }> &
  Promise<{ success: false; error: DetectionError; message: string }> {
  // Validate URL is localhost only (Condition C4)
  if (!isLocalhostUrl(urlString)) {
    consecutiveFailures++;
    throw new DetectionError.DEV_SERVER_UNREACHABLE(
      `SSRF protection: URL host must be 127.0.0.1 or localhost, got: ${urlString}`
    );
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Reset consecutive failures on success
      consecutiveFailures = 0;

      const parsed = new URL(urlString);
      const isHttps = parsed.protocol === "https:";
      const options: http.RequestOptions = {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: "GET",
        timeout: FETCH_TIMEOUT,
        // Per C4: limit response size and check Content-Type
      };

      // Use appropriate module based on protocol
      const requestModule = isHttps ? https : http;

      const result = await new Promise<{
        success: boolean;
        html: string;
        headers: http.IncomingMessage;
      }>((resolve, reject) => {
        const req = requestModule.get(options, (res) => {
          let data = "";

          // Handle size limit (Condition C4: < 10MB)
          res.on("data", (chunk: string | Buffer) => {
            if (data.length + chunk.length > MAX_RESPONSE_SIZE) {
              // Exceed size limit - destroy request
              res.destroy();
              throw new Error("Response exceeds 10MB size limit");
            }
            data += chunk;
          });

          res.on("end", () => {
            // Check Content-Type (Condition C4: text/html or application/json)
            const contentType = res.headers["content-type"] as string | undefined;
            if (contentType && !/^text\/html$/i.test(contentType) && !/^application\/json/i.test(contentType)) {
              // Invalid content type - still return data but mark as CORS/fetch error
              // The caller can check the content type flag
            }
            resolve({
              success: true,
              html: data,
              headers: res,
            });
          });
        });

        req.on("error", (err: Error) => {
          lastError = err;
          reject(err);
        });

        req.on("timeout", () => {
          req.destroy();
          const timeoutError = new Error("Fetch timeout exceeded 10s");
          lastError = timeoutError;
          reject(timeoutError);
        });
      });

      // Check content type from response headers
      const contentType = result.headers.headers["content-type"] as string | undefined;

      if (result.success) {
        // Validate content type
        if (contentType && !/^text\/html$/i.test(contentType) && !/^application\/json/i.test(contentType)) {
          consecutiveFailures++;
          throw new DetectionError.FETCH_FAILED(
            `CORS block prevented fetch: unexpected Content-Type: ${contentType}`
          );
        }

        return { success: true, html: result.html };
      }

    } catch (error: any) {
      lastError = error;

      // Handle specific error types
      if (error.message?.includes("ECONNREFUSED") || error.code === "ECONNREFUSED") {
        // Dev server unreachable - AF-1 flow
        consecutiveFailures++;
        if (attempt < MAX_RETRIES) {
          // Exponential backoff
          const delay = Math.min(FIRST_RETRY_DELAY * 2 ** attempt, MAX_RETRY_DELAY);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw new DetectionError.DEV_SERVER_UNREACHABLE(
          `Dev server not reachable, skipping rendered detection: ${lastError.message}`
        );
      }

      if (error.message?.includes("10MB") || error.message?.includes("size limit")) {
        consecutiveFailures++;
        throw new DetectionError.FETCH_FAILED(
          `Fetch failed: Response exceeds 10MB size limit`
        );
      }

      if (error.message?.includes("CORS") || error.message?.includes("CORS block")) {
        consecutiveFailures++;
        throw error;
      }

      // Generic fetch error
      consecutiveFailures++;
      if (attempt < MAX_RETRIES) {
        const delay = Math.min(FIRST_RETRY_DELAY * 2 ** attempt, MAX_RETRY_DELAY);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw new DetectionError.FETCH_FAILED(
        `Failed to fetch localhost page: ${lastError.message}`
      );
    }
  }

  // Should not reach here, but just in case
  throw new DetectionError.DEV_SERVER_UNREACHABLE(
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