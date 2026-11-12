/**
 * SA4E-393 C6 — user-facing error text for the detection pipeline.
 * Never exposes stacks or absolute paths (SEC-F03: shared redactPaths).
 */
import { DetectionErrorException } from "./types";
import { redactPaths } from "./path-redactor";

const FALLBACK = "An unexpected error occurred during detection";
const MAX_LEN = 200;

/**
 * Sanitized one-line message for an error thrown inside the pipeline.
 * @param error - thrown value
 * @param root - workspace root to redact (optional)
 */
export function friendlyError(error: any, root?: string): string {
  const message: string = error?.message || error?.error || String(error);
  if (error instanceof DetectionErrorException) return redactPaths(message, root) || FALLBACK;
  const cleaned = message.replace(/\/\/[^\n]*/g, "");
  return redactPaths(cleaned, root).substring(0, MAX_LEN) || FALLBACK;
}
