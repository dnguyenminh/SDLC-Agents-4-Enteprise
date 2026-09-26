import * as fs from 'fs';
import * as path from 'path';
import type { PromptVariant } from './model-tier';

export class PromptTemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PromptTemplateError';
  }
}

const COMPRESSED_SUFFIX = '.compressed';

export interface TemplateFileInfo {
  file: string;
  name: string;
  variant: PromptVariant;
}

export function validateTemplateName(name: string): void {
  if (!/^[a-z0-9-]+$/.test(name)) {
    throw new PromptTemplateError(`Invalid template name '${name}'. Must be lowercase letters, numbers, hyphen`);
  }
}

export function parseVariantName(fileName: string): { name: string; variant: PromptVariant } {
  let base = path.basename(fileName, path.extname(fileName));
  let variant: PromptVariant = 'full';
  if (path.extname(base) === COMPRESSED_SUFFIX) {
    variant = 'compressed';
    base = path.basename(base, COMPRESSED_SUFFIX);
  }
  return { name: base, variant };
}

export function readDirRecursive(dir: string): string[] {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => path.join(dir, e.name))
    .filter((f) => /\.(md|txt)$/i.test(f));
}

export function collectTemplateFiles(sources: string[]): TemplateFileInfo[] {
  const found: TemplateFileInfo[] = [];
  for (const src of sources) {
    for (const file of readDirRecursive(src)) {
      try {
        const { name, variant } = parseVariantName(file);
        validateTemplateName(name);
        found.push({ file, name, variant });
      } catch {
        // log and continue
      }
    }
  }
  return found;
}
