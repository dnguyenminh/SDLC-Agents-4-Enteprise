/**
 * pega-response-utils — pure helpers for interpreting Pega REST responses
 * (SA4E-323 refactor: extracted from PegaHttpClient). No I/O, no state.
 */

/**
 * Detect whether a Pega error body signals rule/class not-found. Pega sometimes
 * returns HTTP 500 for not-found instead of 404, so callers use this to
 * reclassify a 5xx as "skip and continue" rather than "abort the crawl".
 */
export function looksLikeNotFoundBody(text: string): boolean {
  if (!text) { return false; }
  const lower = text.toLowerCase();
  return lower.includes("does not exist")
    || lower.includes("rule not found")
    || lower.includes("record not found")
    || lower.includes("no rule found")
    || lower.includes("cannot be found")
    || lower.includes("no such rule");
}

/**
 * Extract the `error`/`message` from a Pega JSON error body, falling back to a
 * short slice of the raw text so callers always have a readable reason.
 */
export function extractBodyError(text: string): string {
  if (!text) { return ""; }
  try {
    const json = JSON.parse(text) as { error?: unknown; message?: unknown };
    const raw = typeof json.error === "string" ? json.error
      : typeof json.message === "string" ? json.message
      : "";
    if (raw) { return raw.substring(0, 180); }
  } catch { /* not JSON — fall through */ }
  return text.substring(0, 180).replace(/\s+/g, " ").trim();
}

/**
 * Unwrap a Pega /rules/query list envelope (pxObjClass="Code-Pega-List") into a
 * single rule object. Returns null for an empty/absent list (not found); passes
 * a non-list body through unchanged (already a single rule).
 */
export function unwrapQueryResult(json: Record<string, unknown>): Record<string, unknown> | null {
  const isListEnvelope = json.pxObjClass === "Code-Pega-List"
    || Array.isArray(json.pxResults)
    || Array.isArray((json as { results?: unknown }).results);
  if (!isListEnvelope) { return json; }
  const results = (json.pxResults ?? (json as { results?: unknown[] }).results) as unknown[] | undefined;
  if (!Array.isArray(results) || results.length === 0) { return null; }
  const first = results[0];
  return (first && typeof first === "object") ? (first as Record<string, unknown>) : null;
}
