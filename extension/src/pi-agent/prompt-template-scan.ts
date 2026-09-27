import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../logger';
import { resolveContainedPath } from './context-retrieval/path-containment';
import type { PromptVariant } from './model-tier';

export class PromptTemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PromptTemplateError';
  }
}

const COMPRESSED_SUFFIX = '.compressed';

/** SEC-326-01 — template files larger than this are skipped (sync-freeze DoS guard, SEC-326-02). */
export const MAX_TEMPLATE_FILE_BYTES = 262_144; // 256 KB

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

/**
 * SEC-326-01/02 — stat-first read: canonicalize via the SA4E-325 containment
 * choke-point (symlink/UNC containment — reuses `resolveContainedPath`), then
 * verify a regular file within the size cap BEFORE reading. Returns the
 * content, or null when any gate fails.
 */
export function readTemplateFile(file: string, rootDir: string, maxBytes = MAX_TEMPLATE_FILE_BYTES): string | null {
  const real = resolveContainedPath(rootDir, file);
  if (!real) {
    logger.warn('Template file rejected: symlink escape / UNC / null-byte path', { file });
    return null;
  }
  try {
    const stat = fs.statSync(real);
    if (!stat.isFile() || stat.size > maxBytes) {
      logger.warn('Template file exceeds size cap, skipped (DoS guard)', { file, size: stat.size, maxBytes });
      return null;
    }
    return fs.readFileSync(real, 'utf-8');
  } catch {
    return null;
  }
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
      } catch (err) {
        // SEC-326-07: log-and-continue with an actual audit log
        logger.debug('Template skipped', {
          file,
          reason: err instanceof Error ? err.message : 'invalid',
        });
      }
    }
  }
  return found;
}
