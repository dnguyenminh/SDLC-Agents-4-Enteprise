/**
 * SA4E-106 — Scalar helpers for Pega content extraction.
 * Extracted from PegaContentExtractor.ts: internal-key filtering, scalar
 * selection and embedded-binary-blob detection (SA4E-338 B2).
 */

/** Field prefixes considered Pega internal metadata (px/pz/__) — excluded from dumps. */
export const INTERNAL_PREFIXES = ['px', 'pz', '__'];

/**
 * A scalar value at/above this length is treated as a candidate "binary blob" and
 * tested for base64 content. Below it, values are kept (possibly truncated) as-is.
 */
export const BINARY_FIELD_MIN_CHARS = 1024;

/** Pega internal metadata fields (px/pz/__) — always excluded. Exported for reuse. */
export function isInternalKey(key: string): boolean {
  return INTERNAL_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/** Keys already rendered in the header — excluded from the scalar dump. */
export function isHeaderKey(key: string): boolean {
  return [
    'pxObjClass', 'pyClassName', 'pyRuleName', 'pyActivityName', 'pyModelName',
    'pyTransformName', 'pyRuleset', 'pyRulesetVersion', 'pyLabel', 'pyDescription',
    'pyShortDescription', 'pyParameters', 'pyPages',
  ].includes(key);
}

/** Heuristic: does a long scalar string look like an embedded binary blob (base64)?
 * Checks only sufficiently long values (perf) and requires a high ratio of base64
 * characters, so ordinary long text (sentences, code) is NOT misclassified.
 * @param value Candidate field value.
 * @returns true when the value is long and overwhelmingly base64-like.
 */
export function looksLikeBinaryBlob(value: string): boolean {
  if (value.length < BINARY_FIELD_MIN_CHARS) return false;
  // Sample the head to avoid scanning hundreds of KB.
  const sample = value.slice(0, 4096);
  const base64ish = sample.replace(/[^A-Za-z0-9+/=\r\n]/g, '');
  // >= 97% of sampled chars are in the base64 alphabet, and there is little whitespace
  // → an encoded blob, not prose/code.
  const ratio = base64ish.length / sample.length;
  const whitespace = (sample.match(/\s/g)?.length ?? 0) / sample.length;
  return ratio >= 0.97 && whitespace < 0.1;
}

/** First non-empty scalar (string/number/boolean) among candidate values. */
export function scalar(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  }
  return undefined;
}

/** First non-empty string among candidate values. */
export function scalarStr(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}
