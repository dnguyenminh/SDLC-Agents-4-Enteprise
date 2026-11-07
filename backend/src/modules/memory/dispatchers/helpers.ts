/**
 * SA4E-41/SEC-01 — shared ingest-file helpers. `readFileContent` lives here so
 * `crud-ingest-file.ts` stays inside the 200-line gate (SA4E-223 pattern).
 */
import * as fs from 'fs';
import * as path from 'path';
import { resolveWithinWorkspace } from '../../../shared/path-safety.js';
import { classifyFormat, normalizeExt } from '../ingest/FormatClassifier.js';
import type { ConvertToolResolver } from '../ingest/ConvertToolResolver.js';

export function tierForType(type: string): string {
  switch (type) {
    case 'REQUIREMENT': case 'ARCHITECTURE': case 'PROCEDURE': case 'API_DESIGN': return 'SEMANTIC';
    case 'DECISION': case 'LESSON_LEARNED': case 'ERROR_PATTERN': return 'EPISODIC';
    default: return 'WORKING';
  }
}

export function inferOwner(source?: string): string {
  if (!source) return 'system';
  const s = source.toLowerCase();
  if (['ba','brd','fsd'].some(k => s.includes(k))) return 'ba-agent';
  if (['sa','tdd'].some(k => s.includes(k))) return 'sa-agent';
  if (['qa','stp','stc','test'].some(k => s.includes(k))) return 'qa-agent';
  if (['dev','code'].some(k => s.includes(k))) return 'dev-agent';
  return 'system';
}

/**
 * SEC-01 — resolve an ALREADY-containment-gated file path for a legacy read.
 * Absolute inputs pass through (the handler gates them against the workspace /
 * allowlist roots via resolveLegacyRead); relative inputs are contained by the
 * shared resolveWithinWorkspace helper — the same function the resolver's
 * legacy branch uses, so `../` traversal and NUL bytes never escape the
 * workspace (the old cwd-relative fallback is closed). Returns null → callers
 * report file-not-found / rejection with their usual contract.
 */
export function resolvePath(fp: string, workspace: string): string | null {
  if (path.isAbsolute(fp)) return path.resolve(fp);
  return resolveWithinWorkspace(workspace, fp);
}

export interface IngestFileResponse {
  status: 'ingested' | 'unconvertible';
  entries?: number;
  file?: string;
  reason?: string;
}

export function unconvertibleMessage(filePath: string, reason: string): string {
  return JSON.stringify({ status: 'unconvertible', file: filePath, reason } satisfies IngestFileResponse);
}

export type ReadOutcome = { ok: true; text: string } | { ok: false; response: string };

/** Resolve + read file content (markdown/text/base64/converter), or an early-return response. */
export async function readFileContent(
  a: Record<string, unknown>, filePath: string, workspace: string, resolver?: ConvertToolResolver,
): Promise<ReadOutcome> {
  const format = classifyFormat({ filePath });
  const providedContent = a.content as string | undefined;
  const contentBase64 = a.content_base64 as string | undefined;

  if (format === 'markdown' || format === 'text') {
    const text = contentBase64 ? Buffer.from(contentBase64, 'base64').toString('utf-8') : providedContent;
    if (!text) {
      const resolved = resolvePath(filePath, workspace);
      if (resolved === null || !fs.existsSync(resolved)) {
        // SEC-01: null (outside workspace — unreachable post-gate, defensive)
        // and a missing file share the Format-1 not-found response.
        return { ok: false, response: `Error: file not found — ${resolved ?? path.resolve(filePath)}` };
      }
      return { ok: true, text: await fs.promises.readFile(resolved, 'utf-8') };
    }
    return { ok: true, text };
  } else if (contentBase64 && contentBase64.trim().length > 0) {
    return { ok: true, text: Buffer.from(contentBase64, 'base64').toString('utf-8') };
  } else if (providedContent && providedContent.trim().length > 0) {
    return { ok: true, text: providedContent };
  } else {
    const resolved = resolvePath(filePath, workspace);
    if (resolved === null || !fs.existsSync(resolved)) return { ok: false, response: unconvertibleMessage(filePath, 'no-tool') };
    if (!resolver) return { ok: false, response: unconvertibleMessage(filePath, 'no-tool') };
    const res = await resolver.resolve({ filePath: resolved, ext: normalizeExt(filePath) });
    if (!res.ok) return { ok: false, response: unconvertibleMessage(filePath, res.reason) };
    return { ok: true, text: res.markdown };
  }
}
