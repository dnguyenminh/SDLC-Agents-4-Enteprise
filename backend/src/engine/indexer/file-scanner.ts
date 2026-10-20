/**
 * File Scanner — Traverses workspace, respects .gitignore, detects language.
 * Produces a list of scannable files with metadata.
 * KSA-191: Added Salesforce extensions + compound extension detection.
 *
 * BR-18 facade — language maps live in ./file-scanner/languages.ts,
 * workspace traversal in ./file-scanner/traversal.ts,
 * sidecar metadata in ./file-scanner/file-meta.ts.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { AppConfig } from '../config.js';
import { createIgnoreParser } from '../parsers/ignore/index.js';
import { resolveContainedPath, resolveWorkspaceRoot } from './path-safety.js';
import type { ScannedFile } from './file-scanner/scanned-file.js';
import { detectLanguage } from './file-scanner/languages.js';
import { hashContent, traverseDirectory } from './file-scanner/traversal.js';
import { loadFileMetadata, type FileMetaEntry } from './file-scanner/file-meta.js';

export type { ScannedFile } from './file-scanner/scanned-file.js';
export { SALESFORCE_META_SUFFIXES, detectLanguage } from './file-scanner/languages.js';
export { loadFileMetadata, type FileMetaEntry } from './file-scanner/file-meta.js';

/** Scan workspace and return list of indexable files. */
export function scanWorkspace(config: AppConfig): ScannedFile[] {
  const results: ScannedFile[] = [];
  const ignoreParser = createIgnoreParser(config.workspace);
  const root = resolveWorkspaceRoot(config.workspace);
  traverseDirectory(config.workspace, config, ignoreParser, results, root);
  return results;
}

/** Scan a single file and return metadata. */
export function scanSingleFile(filePath: string, workspace: string): ScannedFile | null {
  try {
    const realPath = resolveContainedPath(filePath, workspace);
    if (!realPath) return null;
    const content = fs.readFileSync(realPath, 'utf-8');
    const relativePath = path.relative(workspace, filePath).replace(/\\/g, '/');
    const language = detectLanguage(filePath);
    if (!language) return null;

    return {
      absolutePath: filePath,
      relativePath,
      language,
      contentHash: hashContent(content),
      sizeBytes: Buffer.byteLength(content, 'utf-8'),
      lineCount: content.split('\n').length,
    };
  } catch {
    return null;
  }
}
