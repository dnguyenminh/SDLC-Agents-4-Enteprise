/**
 * Async File Scanner — SA4E-44
 * Non-blocking workspace traversal with chunked yield.
 * Replaces synchronous scanWorkspace() to avoid event loop blocking.
 */

import * as fsp from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import type { AppConfig } from '../config.js';
import type { ScannedFile } from '../scanner/file-scanner.js';
import { detectLanguage, loadFileMetadata } from '../scanner/file-scanner.js';
import { createIgnoreParser } from '../parsers/ignore/index.js';

const CHUNK_SIZE = 50;

export async function scanWorkspaceAsync(
  config: AppConfig,
): Promise<ScannedFile[]> {
  const results: ScannedFile[] = [];
  const ignoreParser = createIgnoreParser(config.workspace);
  const metadata = loadFileMetadata(config.workspace);
  const queue: string[] = [config.workspace];
  let processed = 0;

  while (queue.length > 0) {
    const dir = queue.shift()!;
    let entries: any[];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(config.workspace, fullPath)
        .replace(/\\/g, '/');

      if (shouldSkip(entry.name, relPath, config, ignoreParser)) continue;

      if (entry.isDirectory()) {
        queue.push(fullPath);
      } else if (entry.isFile()) {
        const file = await processFile(fullPath, relPath, config, metadata);
        if (file) results.push(file);
      }

      if (++processed % CHUNK_SIZE === 0) {
        await new Promise<void>(r => setImmediate(r));
      }
    }
  }

  return results;
}

function shouldSkip(
  name: string, relPath: string, config: AppConfig,
  ignoreParser: { shouldIgnore(p: string): boolean },
): boolean {
  if (name.startsWith('.') && name !== '.') return true;
  if (config.excludePatterns.some(p => relPath.includes(p) || name === p)) {
    return true;
  }
  return ignoreParser.shouldIgnore(relPath);
}

async function processFile(
  fullPath: string, relPath: string, config: AppConfig,
  metadata: Record<string, { fileCreatedAt?: string; fileAuthor?: string; fileVersion?: string }>,
): Promise<ScannedFile | null> {
  const language = detectLanguage(fullPath);
  if (!language) return null;

  const ext = path.extname(fullPath).toLowerCase();
  const validExt = config.includeExtensions.includes(ext)
    || ext === '.kts' || language === 'salesforce-meta';
  if (!validExt) return null;

  try {
    const stat = await fsp.stat(fullPath);
    if (stat.size > config.maxFileSize) return null;

    const content = await fsp.readFile(fullPath, 'utf-8');
    if (isBinary(content)) return null;

    const meta = metadata[relPath] || {};
    return {
      absolutePath: fullPath,
      relativePath: relPath,
      language,
      contentHash: crypto.createHash('sha256')
        .update(content).digest('hex').slice(0, 16),
      sizeBytes: stat.size,
      lineCount: content.split('\n').length,
      fileCreatedAt: meta.fileCreatedAt || stat.birthtime?.toISOString(),
      fileAuthor: meta.fileAuthor,
      fileVersion: meta.fileVersion,
    };
  } catch {
    return null;
  }
}

function isBinary(content: string): boolean {
  const sample = content.slice(0, 1024);
  return (sample.match(/\0/g) || []).length > 2;
}
