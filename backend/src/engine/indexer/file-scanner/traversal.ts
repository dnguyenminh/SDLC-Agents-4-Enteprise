/**
 * Workspace traversal + file filtering for the file scanner.
 * Extracted from file-scanner.ts (BR-18) — no behavior change.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { AppConfig } from '../../config.js';
import type { IgnoreParser } from '../../parsers/ignore/index.js';
import { isWithinWorkspace } from '../path-safety.js';
import type { ScannedFile } from '../file-scanner.js';
import { detectLanguage, getExtension } from './languages.js';

export function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

export function traverseDirectory(
  dir: string,
  config: AppConfig,
  ignoreParser: IgnoreParser,
  results: ScannedFile[],
  root: string
): void {
  const entries = safeReadDir(dir);
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(config.workspace, fullPath).replace(/\\/g, '/');

    if (shouldExclude(relPath, entry.name, config.excludePatterns, ignoreParser)) continue;

    if (entry.isDirectory()) {
      traverseDirectory(fullPath, config, ignoreParser, results, root);
    } else if (entry.isFile()) {
      const file = processFile(fullPath, relPath, config, root);
      if (file) results.push(file);
    }
  }
}

function processFile(fullPath: string, relPath: string, config: AppConfig, root: string): ScannedFile | null {
  const language = detectLanguage(fullPath);
  if (!language) return null;

  const ext = getExtension(fullPath);
  // Allow through if simple extension matches OR if compound extension detected (salesforce-meta)
  if (!config.includeExtensions.includes(ext) && ext !== '.kts' && language !== 'salesforce-meta' && ext !== '.jsp') return null;

  try {
    // F-01: reject symlinks that escape the workspace (realpath containment).
    // .native so the form matches resolveWorkspaceRoot (short vs long on Windows).
    const realPath = fs.realpathSync.native(fullPath);
    if (!isWithinWorkspace(realPath, root)) return null;

    const stat = fs.statSync(realPath);
    if (stat.size > config.maxFileSize) return null;

    const content = fs.readFileSync(realPath, 'utf-8');
    if (isBinary(content)) return null;

    return {
      absolutePath: fullPath,
      relativePath: relPath,
      language,
      contentHash: hashContent(content),
      sizeBytes: stat.size,
      lineCount: content.split('\n').length,
    };
  } catch {
    return null;
  }
}

function shouldExclude(
  relPath: string, name: string, excludes: string[], ignoreParser: IgnoreParser
): boolean {
  if (name.startsWith('.') && name !== '.') return true;
  for (const pattern of excludes) {
    if (relPath.includes(pattern) || name === pattern) return true;
  }
  return ignoreParser.shouldIgnore(relPath);
}

function isBinary(content: string): boolean {
  const sample = content.slice(0, 1024);
  const nullCount = (sample.match(/\0/g) || []).length;
  return nullCount > 2;
}

function safeReadDir(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}
