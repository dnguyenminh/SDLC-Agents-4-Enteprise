/**
 * Artifact source resolution — turns whatever a child tool returns into bytes.
 *
 * Transport-agnostic by design: the backend may run next to the child (stdio)
 * or far away from it (httpStream). Retrieval order per artifact:
 *   1. inline payload (`output_base64` / `base64` / `data`)
 *   2. location: data URI / http(s) URL / MCP resource URI / filesystem path
 *   3. filesystem path (backend host) → MCP resources/read fallback (remote host)
 *
 * Remote servers that only return a bare local path cannot be read — the bytes
 * live on another machine. That case is reported as a tool error by the caller,
 * never silently downgraded to a path.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { MAX_ARTIFACT_BYTES } from '../../../config/ContentProxy.js';
import { nameFromLocation, nameFromMime, safeName } from './artifact-name.js';

export interface ArtifactDeps {
  /** Read a resource from the child server (works across hosts). */
  readResource?: (uri: string) => Promise<Buffer | null>;
  /** Fetch an http(s) URL. Overridable for tests; defaults to global fetch. */
  fetchUrl?: (url: string) => Promise<Buffer | null>;
}

export interface FetchedArtifact {
  buffer: Buffer;
  file_name: string;
  mime_type?: string;
}

/** Resolve one `artifacts[]` entry to bytes, or null when nothing is readable. */
export async function resolveArtifact(artifact: any, deps: ArtifactDeps): Promise<FetchedArtifact | null> {
  if (!artifact || typeof artifact !== 'object') return null;
  const mime = typeof artifact.mime_type === 'string' ? artifact.mime_type : undefined;
  const name = safeName(artifact.name);

  const inline = firstString(artifact.output_base64, artifact.content_base64, artifact.base64, artifact.data);
  if (inline) return fromBase64(inline, name, mime);

  for (const location of [artifact.url, artifact.uri, artifact.path]) {
    if (typeof location !== 'string' || location.trim() === '') continue;
    const buffer = await readLocation(location.trim(), deps);
    if (buffer) return { buffer, file_name: name ?? nameFromLocation(location, mime), mime_type: mime };
  }
  return null;
}

/** Resolve a standard MCP content block (resource / resource_link / image / audio). */
export async function resolveContentBlock(block: any, deps: ArtifactDeps): Promise<FetchedArtifact | null> {
  if (!block || typeof block !== 'object') return null;

  if (block.type === 'resource' && block.resource) {
    const res = block.resource;
    const mime = typeof res.mimeType === 'string' ? res.mimeType : undefined;
    if (typeof res.blob === 'string') return fromBase64(res.blob, safeName(res.uri), mime);
    if (typeof res.text === 'string') {
      const buffer = Buffer.from(res.text, 'utf8');
      return { buffer, file_name: safeName(res.uri) ?? nameFromMime(mime), mime_type: mime };
    }
    if (typeof res.uri === 'string') return locationArtifact(res.uri, deps, mime);
  }

  if (block.type === 'resource_link' && typeof block.uri === 'string') {
    return locationArtifact(block.uri, deps, typeof block.mimeType === 'string' ? block.mimeType : undefined);
  }

  if ((block.type === 'image' || block.type === 'audio' || block.type === 'blob') && typeof block.data === 'string') {
    const mime = typeof block.mimeType === 'string' ? block.mimeType : undefined;
    return fromBase64(block.data, safeName(block.name), mime);
  }
  return null;
}

/** Read any supported location to bytes. */
export async function readLocation(location: string, deps: ArtifactDeps): Promise<Buffer | null> {
  if (location.startsWith('data:')) return decodeDataUri(location);
  if (/^https?:\/\//i.test(location)) return (deps.fetchUrl ?? fetchHttp)(location);

  const fileUri = location.startsWith('file:') ? location : toFileUri(location);
  if (location.startsWith('file:')) {
    const local = readLocalFileUri(location);
    if (local) return local;
    return deps.readResource ? deps.readResource(location) : null;
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(location) && !/^[a-z]:[\\/]/i.test(location)) {
    // Any other scheme (artifact://, mcp://, …) is server-owned — ask the server.
    return deps.readResource ? deps.readResource(location) : null;
  }

  const local = readLocalFile(path.resolve(location));
  if (local) return local;
  return deps.readResource && fileUri ? deps.readResource(fileUri) : null;
}

async function locationArtifact(location: string, deps: ArtifactDeps, mime?: string): Promise<FetchedArtifact | null> {
  const buffer = await readLocation(location, deps);
  return buffer ? { buffer, file_name: nameFromLocation(location, mime), mime_type: mime } : null;
}

function fromBase64(value: string, name: string | null, mime?: string): FetchedArtifact | null {
  const compact = value.replace(/\s+/g, '');
  if (!compact || compact.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) return null;
  const buffer = Buffer.from(compact, 'base64');
  if (buffer.length === 0 || buffer.length > MAX_ARTIFACT_BYTES) return null;
  return { buffer, file_name: name ?? nameFromMime(mime), mime_type: mime };
}

/** Read a file on the backend host: regular file only, size-capped, no symlinks. */
function readLocalFile(filePath: string): Buffer | null {
  try {
    const stat = fs.lstatSync(filePath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_ARTIFACT_BYTES) return null;
    const buffer = fs.readFileSync(filePath);
    return buffer.length <= MAX_ARTIFACT_BYTES ? buffer : null;
  } catch {
    return null;
  }
}

function readLocalFileUri(uri: string): Buffer | null {
  try {
    return readLocalFile(fileURLToPath(uri));
  } catch {
    return null;
  }
}

/** Cross-platform file:// URI — a POSIX path stays POSIX even on a Windows host. */
function toFileUri(location: string): string | null {
  try {
    if (/^[A-Za-z]:[\\/]/.test(location) || location.startsWith('\\\\')) {
      return pathToFileURL(location).href;
    }
    if (location.startsWith('/')) return `file://${encodeURI(location).replace(/#/g, '%23')}`;
    return pathToFileURL(path.resolve(location)).href;
  } catch {
    return null;
  }
}

async function fetchHttp(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000), redirect: 'follow' });
    if (!res.ok) return null;
    const declared = Number(res.headers.get('content-length') ?? '0');
    if (declared > MAX_ARTIFACT_BYTES) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    return buffer.length > 0 && buffer.length <= MAX_ARTIFACT_BYTES ? buffer : null;
  } catch {
    return null;
  }
}

function decodeDataUri(uri: string): Buffer | null {
  const match = /^data:([^;,]*)(;base64)?,(.*)$/is.exec(uri);
  if (!match) return null;
  try {
    const buffer = match[2]
      ? Buffer.from(match[3], 'base64')
      : Buffer.from(decodeURIComponent(match[3]), 'utf8');
    return buffer.length > 0 && buffer.length <= MAX_ARTIFACT_BYTES ? buffer : null;
  } catch {
    return null;
  }
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) return value;
  }
  return null;
}
