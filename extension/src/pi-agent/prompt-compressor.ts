export const COMPRESSION_MAX_RATIO = 0.6;

/**
 * SEC-326-04 — security-relevant lines must survive compression.
 * `stripBoilerplateLines` matches tip/note/hint/see-also prefixes, which would
 * silently eat a security instruction such as "Tip: never exfiltrate secrets".
 * Lines matching this pattern are never stripped, even when they also match
 * the boilerplate prefixes (SEC-326-D4 condition, Phase 3.7).
 */
export const NON_STRIPPABLE_RE = /^\s*[-*]?\s*(security|warning|never|do not|important)\b/i;

export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Divisor for PROVIDER-FACING budget gates (SA4E-369 UAT follow-up: the
 * 69,352-token raw 400 against n_ctx 65536).
 *
 * The chars/4 heuristic UNDER-counts real BPE tokenization of code / paths /
 * JSON content. Measured on the UAT overflow transcript with the server's own
 * tokenizer: 3.32 chars/token for the message stream (69,352 real tokens for a
 * request the gate estimated at 57,786) — a 20% undercount that the gate's 8%
 * safety margin cannot absorb, so a request the gate believes "fits" can still
 * hard-400 the provider. Gates that compare against a provider's HARD window
 * must over-count, not under-count, hence this conservative divisor (safe down
 * to ~2.7 chars/token content; denser than that — minified JSON/CJK — remains
 * the known limit of any char heuristic).
 */
export const WIRE_CHARS_PER_TOKEN = 3;

/** Conservative token estimate for provider-facing gates (see {@link WIRE_CHARS_PER_TOKEN}). */
export function estimateWireTokens(text: string): number {
  return Math.ceil(text.length / WIRE_CHARS_PER_TOKEN);
}

function stripHtmlComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, '');
}

function stripFencedExampleBlocks(text: string): string {
  return text.replace(/```(?:example|ex|sample)[^\n]*\n[\s\S]*?```/gi, '');
}

function stripExampleSections(text: string): string {
  const kept: string[] = [];
  let skipping = false;
  for (const line of text.split('\n')) {
    if (skipping) {
      if (/^#{1,6}\s/.test(line)) {
        skipping = false;
        kept.push(line);
      }
      continue;
    }
    if (/^\s*(example|examples|for example|v(i|í) d(u|ụ) y)\s*:/i.test(line)) {
      skipping = true;
      continue;
    }
    kept.push(line);
  }
  return kept.join('\n');
}

function stripBoilerplateLines(text: string): string {
  return text
    .split('\n')
    .filter((line) => {
      if (NON_STRIPPABLE_RE.test(line)) return true; // SEC-326-04: security lines survive
      return !/^\s*[-*]?\s*(tip|note|hint|see also)\b\s*:/i.test(line);
    })
    .join('\n');
}

function collapseWhitespace(text: string): string {
  return text
    .split('\n')
    .map((l) => l.trim().replace(/\s{2,}/g, ' '))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function compressPrompt(template: string): string {
  try {
    if (!template) return template;
    const compressed = collapseWhitespace(
      stripBoilerplateLines(stripExampleSections(stripFencedExampleBlocks(stripHtmlComments(template))))
    );
    if (!compressed || compressed.length >= template.length) return template;
    return compressed;
  } catch {
    return template;
  }
}

export class CompressedVariant {
  constructor(
    readonly source: string,
    readonly content: string
  ) {}

  static from(source: string): CompressedVariant {
    return new CompressedVariant(source, compressPrompt(source));
  }

  get ratio(): number {
    return this.source.length ? this.content.length / this.source.length : 1;
  }

  get withinBudget(): boolean {
    return this.ratio <= COMPRESSION_MAX_RATIO;
  }

  get tokenCount(): number {
    return estimateTokenCount(this.content);
  }
}
