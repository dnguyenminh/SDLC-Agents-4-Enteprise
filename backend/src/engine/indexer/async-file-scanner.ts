/**
 * Async File Scanner — SA4E-44
 * Non-blocking workspace traversal with chunked yield.
 * Replaces synchronous scanWorkspace() to avoid event loop blocking.
 */

import * as fsp from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import type { AppConfig } from '../config.js';
import type { ScannedFile } from './file-scanner.js';
import { detectLanguage, loadFileMetadata } from './file-scanner.js';
import { createIgnoreParser } from '../parsers/ignore/index.js';
import {
  canonicalRealPathSync,
  isWithinWorkspace,
  resolveWorkspaceRoot,
} from './path-safety.js';

const CHUNK_SIZE = 50;

export async function scanWorkspaceAsync(
  config: AppConfig,
): Promise<ScannedFile[]> {
  const results: ScannedFile[] = [];
  // Canonicalize the workspace ONCE up front: `resolveWorkspaceRoot` expands
  // Windows 8.3 short names (C:\Users\NGUYEN~1\… → C:\Users\nguyenminhduc3\…)
  // via realpathSync.native, and we traverse from that canonical form so every
  // fullPath we build is already long. Per-file `fsp.realpath` echoes its input
  // form, so a long input stays long and containment against the long root holds
  // — otherwise every file would look "outside" and be dropped ("Found 0 files").
  const root = resolveWorkspaceRoot(config.workspace);
  const ignoreParser = createIgnoreParser(root);
  const metadata = loadFileMetadata(root);
  const queue: string[] = [root];
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
      const relPath = path.relative(root, fullPath)
        .replace(/\\/g, '/');

      if (shouldSkip(entry.name, relPath, config, ignoreParser)) continue;

      if (entry.isDirectory()) {
        queue.push(fullPath);
      } else if (entry.isFile()) {
        const file = await processFile(fullPath, relPath, config, metadata, root);
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
  root: string,
): Promise<ScannedFile | null> {
  const language = detectLanguage(fullPath);
  if (!language) return null;

  const ext = path.extname(fullPath).toLowerCase();
  const validExt = config.includeExtensions.includes(ext)
    || ext === '.kts' || language === 'salesforce-meta' || ext === '.jsp';
  if (!validExt) return null;

  try {
    // F-01: reject symlinks that escape the workspace (realpath containment).
    const realPath = await fsp.realpath(fullPath);
    // fsp.realpath echoes its input's 8.3 form. If a short-form path ever reaches
    // here while `root` is native-long, re-check with the canonical form before
    // rejecting, so an inside file is never dropped as an escape.
    if (!isWithinWorkspace(realPath, root)
      && !isWithinWorkspace(canonicalRealPathSync(fullPath) ?? realPath, root)) return null;

    const stat = await fsp.stat(realPath);
    if (stat.size > config.maxFileSize) return null;

    const content = await fsp.readFile(realPath, 'utf-8');
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
