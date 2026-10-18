/**
 * KnowledgeClient options and Backend KB base URL resolution (SA4E-320).
 */

import { getBackendUrl } from "../config/backend-url";

export interface KnowledgeClientOptions {
  timeoutMs?: number;
  retries?: number;
  /** Build auth headers (Bearer token + X-Project-Id) per request. */
  getHeaders?: () => Record<string, string>;
}

export const DEFAULT_TIMEOUT_MS = 10000;
export const DEFAULT_RETRIES = 2;

/** Resolve the Backend KB base URL (no trailing slash). */
export function resolveKbBaseUrl(): string {
  // Check env override first (used in tests and when port differs)
  const envPort = process.env.CODE_INTEL_PORT;
  if (envPort) {
    const port = parseInt(envPort, 10);
    if (Number.isInteger(port) && port >= 1024 && port <= 65535) {
      return `http://127.0.0.1:${port}`;
    }
  }
  try {
    // Delegate to shared config utility — reads backend.url AND the
    // allowInsecureRemote flag from VS Code config (SA4E-320).
    return getBackendUrl();
  } catch {
    // Validation failure / config unavailable — fall back to default
    return "http://127.0.0.1:48721";
  }
}
