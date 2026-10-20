/**
 * SA4E-106 / SA4E-338 B2 — scalar-only field dump for Pega rules.
 * Extracted from PegaContentExtractor.ts: last-resort FIELDS section when no
 * dedicated logic block matched. Binary/base64 blobs are dropped and reported
 * via the `binaryStripped` flag.
 */

import type { PegaRuleJson } from './PegaContentExtractor.js';
import { isHeaderKey, isInternalKey, looksLikeBinaryBlob } from './PegaScalarHelpers.js';

/** Max lines for the generic scalar fallback dump. */
const MAX_DUMP_LINES = 250;

/**
 * Max characters kept per scalar field value in the dump. A single Pega data field
 * can hold an embedded binary asset (e.g. a base64-encoded ZIP/image in
 * Data-Mobile-Application-Branding-Asset.pyAssetSource) hundreds of KB long. Those
 * blobs are not readable logic for the LLM and overflow the context window, so each
 * field value is bounded. Logic blocks have their own item/line caps.
 */
const MAX_FIELD_VALUE_CHARS = 2000;

/**
 * Scalar-only fallback dump; arrays/objects are covered by logic blocks.
 * @param ruleJson - Raw Pega rule JSON.
 * @param flags - Mutable sink; `binaryStripped` is set true when a blob is dropped.
 */
export function buildFieldDump(ruleJson: PegaRuleJson, flags: { binaryStripped: boolean }): string | null {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(ruleJson)) {
    if (lines.length >= MAX_DUMP_LINES) break;
    if (isInternalKey(key) || isHeaderKey(key)) continue;
    if (value === null || value === undefined) continue;
    if (Array.isArray(value) || typeof value === 'object') continue;
    const s = String(value).trim();
    if (!s) continue;
    // Drop embedded binary assets (e.g. base64 ZIP/image in branding-asset rules).
    if (looksLikeBinaryBlob(s)) {
      flags.binaryStripped = true;
      lines.push(`${key}: [binary content omitted, ${s.length} chars]`);
      continue;
    }
    // Bound each value so an unusually long (but non-binary) field cannot overflow.
    const bounded = s.length > MAX_FIELD_VALUE_CHARS ? s.slice(0, MAX_FIELD_VALUE_CHARS) + '…[truncated]' : s;
    lines.push(`${key}: ${bounded}`);
  }
  return lines.length > 0 ? `FIELDS:\n${lines.join('\n')}` : null;
}
