/**
 * SA4E-422 — Runtime tokenizer (16K Doc §4: "use the actual tokenizer of the
 * selected model — tiktoken/runtime endpoint", NOT a char heuristic alone).
 *
 * For local models served by llama.cpp (the qwen path), the server exposes
 * `POST {baseUrl}/tokenize` which tokenizes with the EXACT model tokenizer.
 * This module wires that endpoint into the budget path; every failure mode
 * (no baseUrl, network error, HTTP error, bad payload, timeout) fails open to
 * `null` so callers keep the existing conservative estimate (SA4E-369
 * `estimateWireTokens` + 8% margin) — a broken endpoint must never block a turn.
 */

import { logger } from '../logger';

export interface RuntimeTokenizeOptions {
  /** Provider base URL, e.g. http://127.0.0.1:8080/v1 → /tokenize is derived. */
  baseUrl: string;
  /** Injected for tests; defaults to global fetch. */
  fetchFn?: typeof fetch;
  /** Hard timeout — the gate must not stall session creation. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 1500;

/** llama.cpp returns { tokens: number[] }; accept { count } from other servers. */
function extractCount(payload: unknown): number | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as { tokens?: unknown; count?: unknown };
  if (Array.isArray(p.tokens)) return p.tokens.length;
  if (typeof p.count === 'number' && Number.isFinite(p.count)) return p.count;
  return null;
}

/**
 * Tokenize `text` with the model's real tokenizer via the runtime endpoint.
 * Returns the exact token count, or `null` when unavailable (fail-open).
 */
export async function tryRuntimeTokenCount(
  text: string,
  opts: RuntimeTokenizeOptions,
): Promise<number | null> {
  if (!text || !opts.baseUrl) return null;
  const fetchFn = opts.fetchFn ?? fetch;
  const url = `${opts.baseUrl.replace(/\/+$/, '')}/tokenize`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetchFn(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: text }),
      signal: controller.signal,
    });
    if (!res.ok) {
      logger.debug('PI_RUNTIME_TOKENIZE_HTTP', { status: res.status, url });
      return null;
    }
    return extractCount(await res.json());
  } catch (err) {
    logger.debug('PI_RUNTIME_TOKENIZE_UNAVAILABLE', { error: (err as Error).message, url });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Measure the static session context (context files + workspace prompt) with
 * the runtime tokenizer. `undefined` → caller falls back to estimates.
 */
export async function measureRuntimeStaticTokens(
  baseUrl: string | undefined,
  files: ReadonlyArray<{ content: string }>,
  workspacePrompt: string,
  fetchFn?: typeof fetch,
): Promise<number | undefined> {
  if (!baseUrl || files.length === 0) return undefined;
  const text = `${files.map((f) => f.content).join('\n')}\n${workspacePrompt}`;
  const count = await tryRuntimeTokenCount(text, { baseUrl, fetchFn });
  return count ?? undefined;
}
