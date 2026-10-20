/**
 * File metadata sidecar (.code-intel/file-meta.json) loading.
 * Extracted from file-scanner.ts (BR-18) — no behavior change.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface FileMetaEntry {
  fileCreatedAt?: string;
  fileAuthor?: string;
  fileVersion?: string;
}

/**
 * Load file metadata from the .code-intel/file-meta.json sidecar.
 * Returns a map from relative file path → metadata entry.
 */
export function loadFileMetadata(
  workspace: string,
): Record<string, FileMetaEntry> {
  const metaPath = path.join(workspace, '.code-intel', 'file-meta.json');
  try {
    const raw = fs.readFileSync(metaPath, 'utf-8');
    return JSON.parse(raw) as Record<string, FileMetaEntry>;
  } catch {
    return {};
  }
}
