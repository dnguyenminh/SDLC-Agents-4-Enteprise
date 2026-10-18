/**
 * KnowledgeClient validation helpers — UUID v4 contract (PBT-HYD-01, STC §8.1)
 * and the recoverable backend-unreachable error.
 */

import type { KbThread } from "./models";

// --- UUID v4 contract (PBT-HYD-01, STC §8.1) ---

export const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidV4(value: string): boolean {
  return UUID_V4_REGEX.test(value);
}

/** Parse a raw thread JSON string, returning the thread or null. */
export function parseThreadJson(raw: string): KbThread | null {
  try {
    const parsed = JSON.parse(raw) as KbThread;
    return parsed && typeof parsed.thread_id === "string" ? parsed : null;
  } catch {
    return null;
  }
}

/** Validate a raw thread JSON string against the UUID v4 contract. */
export function validateThreadJson(raw: string): { valid: boolean; reason?: string } {
  const thread = parseThreadJson(raw);
  if (!thread) { return { valid: false, reason: "not-json-or-missing-thread_id" }; }
  if (!isUuidV4(thread.thread_id)) { return { valid: false, reason: "invalid-thread-id" }; }
  return { valid: true };
}

// --- Recoverable backend-unreachable error ---

export class KbUnreachableError extends Error {
  readonly recoverable = true;
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "KbUnreachableError";
  }
}
