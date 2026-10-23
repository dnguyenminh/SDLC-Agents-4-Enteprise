/**
 * Result adapter — inlines child artifacts as base64 so the extension wrapper can
 * write them to disk. Only runs in wrapper mode (content in → content out), so
 * direct dynamic calls keep returning the child's lightweight path response.
 *
 * The child result text is usually a JSON document shaped like:
 *   { success, summary, artifacts: [{ path, name, mime_type, size }] }
 * Bytes may also arrive as MCP resource blocks (remote servers). Absolute host
 * paths are stripped from the response; bytes travel as base64.
 *
 * Wrapper-mode contract: content or a hard error — never a bare path. A path
 * that the backend cannot read (remote server, same-host invariant broken) is
 * reported as ARTIFACT_FETCH_FAILED so the caller cannot mistake it for success.
 */

import type { AdaptedInvocation } from './types.js';
import type { ArtifactDeps, FetchedArtifact } from './artifact-source.js';
import { resolveArtifact, resolveContentBlock } from './artifact-source.js';
import { safeName } from './artifact-name.js';

export interface ResultAdapterDeps extends ArtifactDeps {
  /** Child server name — included in retrieval errors. */
  serverName?: string;
}

/** Adapt a child result for wrapper mode; unchanged for direct calls. */
export async function adaptResult(
  invocation: AdaptedInvocation,
  result: any,
  deps: ResultAdapterDeps = {},
): Promise<any> {
  if (!invocation.wrapperMode || !invocation.capability.fileOutput) return result;
  if (!result || result.isError) return result;

  const parsed = parseJsonText(extractText(result));
  const artifacts: any[] = Array.isArray(parsed?.artifacts) ? parsed!.artifacts : [];
  const files = await collectFiles(artifacts, result, deps);

  if (files.length === 0) {
    if (artifacts.length > 0) return retrievalError(deps.serverName, artifacts);
    return result;
  }

  const updated = shapeResult(parsed, artifacts, files);
  return replaceText(result, JSON.stringify(updated));
}

/** Resolve descriptors first, then standard inline MCP content blocks. */
async function collectFiles(
  artifacts: any[],
  result: any,
  deps: ResultAdapterDeps,
): Promise<FetchedArtifact[]> {
  const files: FetchedArtifact[] = [];
  for (const artifact of artifacts) {
    const file = await resolveArtifact(artifact, deps);
    if (file) files.push(file);
  }
  if (files.length > 0) return files;
  for (const block of contentBlocks(result)) {
    const file = await resolveContentBlock(block, deps);
    if (file) files.push(file);
  }
  return files;
}

function shapeResult(parsed: Record<string, any> | null, artifacts: any[], files: FetchedArtifact[]): Record<string, any> {
  const base: Record<string, any> = parsed ? { ...parsed } : {};
  delete base.file_path;
  delete base.output_path;
  delete base.outputs;

  const first = files[0];
  const updated: Record<string, any> = {
    ...base,
    success: base.success !== false,
    file_name: first.file_name,
    size_bytes: first.buffer.length,
    output_base64: first.buffer.toString('base64'),
  };
  if (first.mime_type) updated.mime_type = first.mime_type;

  // Drop host locations; keep only display metadata the caller may render.
  updated.artifacts = artifacts.length > 0
    ? artifacts.map((artifact) => ({
        name: artifact?.name,
        mime_type: artifact?.mime_type,
        size: artifact?.size,
      }))
    : files.map((file) => ({ name: file.file_name, mime_type: file.mime_type, size: file.buffer.length }));

  if (files.length > 1) {
    updated.outputs = files.map((file) => ({
      file_name: file.file_name,
      mime_type: file.mime_type,
      size_bytes: file.buffer.length,
      output_base64: file.buffer.toString('base64'),
    }));
    delete updated.size_bytes;
    delete updated.output_base64;
    updated.file_name = first.file_name;
  }
  return updated;
}

/** Wrapper mode must fail loudly — a bare path would silently lose the file. */
function retrievalError(serverName: string | undefined, artifacts: any[]): any {
  const labels = artifacts.map((artifact) => safeName(artifact?.name) ?? 'artifact').join(', ');
  const where = serverName ? ` from server '${serverName}'` : '';
  const text =
    `ARTIFACT_FETCH_FAILED: ${labels}${where} could not be read by the backend. ` +
    'The tool produced a file on its host but returned no readable content. ' +
    'Remote servers must expose artifacts as MCP resources (resources/read), http(s) URLs, or data URIs; ' +
    'path-only artifacts require the server to run on the backend host. No file was written.';
  return { content: [{ type: 'text', text }], isError: true };
}

function contentBlocks(result: any): any[] {
  return Array.isArray(result?.content) ? result.content : [];
}

function parseJsonText(text: string | null): Record<string, any> | null {
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function extractText(result: any): string | null {
  if (typeof result === 'string') return result;
  const block = result?.content?.find((b: any) => b?.type === 'text' && typeof b.text === 'string');
  return block?.text ?? null;
}

function replaceText(result: any, text: string): any {
  if (typeof result === 'string') return text;
  const content: any[] = Array.isArray(result?.content) ? result.content : [];
  const index = content.findIndex((block) => block?.type === 'text');
  if (index < 0) {
    // Resource-only results have no text block yet — prepend the adapter output
    // (the extension reads content[0].text).
    return { ...result, content: [{ type: 'text', text }, ...content] };
  }
  const next = content.slice();
  next[index] = { ...content[index], text };
  return { ...result, content: next };
}
