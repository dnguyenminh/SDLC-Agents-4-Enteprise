/**
 * Artifact naming — derive a safe, bare file name for inlined bytes.
 * No path fragments ever leave the backend: only `path.basename` survives.
 */

import * as path from 'path';

/** Keep only a bare file name — never a path fragment from a child result. */
export function safeName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().split(/[?#]/)[0];
  const base = path.basename(trimmed);
  return base.length > 0 && base !== '.' && base !== '..' ? base : null;
}

/** File name from a location (path/URI) or, failing that, from the MIME type. */
export function nameFromLocation(location: string, mime?: string): string {
  return safeName(location) ?? nameFromMime(mime);
}

/** Stable fallback name when the child provides neither a name nor a usable location. */
export function nameFromMime(mime?: string): string {
  return (mime && MIME_NAMES[mime.toLowerCase()]) || 'artifact.bin';
}

const MIME_NAMES: Record<string, string> = {
  'application/pdf': 'artifact.pdf',
  'application/json': 'artifact.json',
  'application/zip': 'artifact.zip',
  'text/html': 'artifact.html',
  'text/plain': 'artifact.txt',
  'text/markdown': 'artifact.md',
  'image/png': 'artifact.png',
  'image/jpeg': 'artifact.jpg',
  'image/svg+xml': 'artifact.svg',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'artifact.docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'artifact.xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'artifact.pptx',
};
