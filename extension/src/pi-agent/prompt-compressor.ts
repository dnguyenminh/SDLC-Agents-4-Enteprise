export const COMPRESSION_MAX_RATIO = 0.6;

export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
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
    .filter((line) => !/^\s*[-*]?\s*(tip|note|hint|see also)\b\s*:/i.test(line))
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
