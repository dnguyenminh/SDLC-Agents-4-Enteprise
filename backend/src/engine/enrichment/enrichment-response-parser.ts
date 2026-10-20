/**
 * SA4E-107: LLM response parsing (extracted from CodeEnrichmentHandler).
 * Parses enrichment responses with JSON-first strategy and regex fallback
 * for malformed model output.
 */

import type { CodeEnrichmentLLMResponse, EnrichmentStrategy } from './types.js';

/** Parse LLM response with regex fallback on JSON parse failure. */
export function parseEnrichmentResponse(
  raw: string,
  strategy: EnrichmentStrategy,
): CodeEnrichmentLLMResponse {
  // Attempt 1: direct JSON parse
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.summary === 'string') return parsed;
  } catch { /* fallback below */ }

  // Attempt 2: extract from markdown code fence
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try {
      const parsed = JSON.parse(fenceMatch[1].trim());
      if (parsed && typeof parsed.summary === 'string') return parsed;
    } catch { /* fallback below */ }
  }

  // Attempt 3: regex extraction of individual fields
  return regexFallbackParse(raw, strategy);
}

/** Last-resort regex extraction when the response is not valid JSON. */
function regexFallbackParse(
  raw: string,
  strategy: EnrichmentStrategy,
): CodeEnrichmentLLMResponse {
  const summaryMatch = raw.match(/"summary"\s*:\s*"([^"]+)"/);
  const pseudoMatch = raw.match(/"pseudo_code"\s*:\s*"([^"]+)"/);
  const tagsMatch = raw.match(/"tags"\s*:\s*\[([^\]]*)\]/);

  const summary = summaryMatch?.[1] ?? raw.slice(0, 200).replace(/["\n]/g, ' ').trim();
  const result: CodeEnrichmentLLMResponse = { summary };

  if (strategy !== 'TAG_EXTRACTION' && pseudoMatch) {
    result.pseudo_code = pseudoMatch[1];
  }
  if (tagsMatch) {
    const tagStrs = tagsMatch[1].match(/"([^"]+)"/g)?.map(s => s.replace(/"/g, ''));
    result.tags = tagStrs ?? [];
  }
  return result;
}
