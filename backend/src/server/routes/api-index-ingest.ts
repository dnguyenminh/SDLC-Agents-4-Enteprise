/**
 * Document-ingest helpers for POST /api/index/ingest-docs (SA4E-99, defect-fixed by SA4E-337).
 *
 * SA4E-337-QA-001 context: the previous implementation called `mem.getDispatcher()`,
 * which does NOT exist on MemoryModule (it only exposes the public `dispatcher` field
 * and `setDispatcher()`), causing HTTP 500 "mem.getDispatcher is not a function".
 *
 * The supported entry point is `MemoryModule.getToolHandlers().get('mem_ingest_file')`:
 * that handler is wrapped with `withScopeContext()`, which reads the trusted tenant
 * scope (`_projectContext` / `__userId` / `__projectId`) from the args and injects it
 * into the dispatcher — so `knowledge_entries.project_id` is populated. Calling the
 * bare `mem.dispatcher.dispatch()` would leave the scope unset and write `project_id`
 * NULL, leaking entries out of tenant isolation.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Logger } from 'pino';
import type { ToolHandler, ToolResult } from '../../types/tool.js';

/** Trusted tenant identity for one ingest request (session user + X-Project-Id). */
export interface IngestTenant {
  userId: string;
  projectId: string;
}

/** Aggregated per-run counters returned to the client ({ ingested, errors, total, failedFiles }). */
export interface IngestOutcome {
  ingested: number;
  errors: number;
  total: number;
  failedFiles: { file: string; reason: string }[];
}

/**
 * SA4E-337 Bug #1: derive KB entry type from the file path pattern.
 * BRD/FSD → REQUIREMENT, TDD → ARCHITECTURE, STP/STC/DPG/RLN/UG/RUN-LOG → PROCEDURE,
 * everything else (incl. .drawio, meeting notes) → CONTEXT (TDD §3.2 type rules).
 */
export function inferTypeFromPath(filePath: string): string {
  const name = path.basename(filePath).toUpperCase();
  if (/^(BRD|FSD)/.test(name)) return 'REQUIREMENT';
  if (/^TDD/.test(name)) return 'ARCHITECTURE';
  if (/^(STP|STC|DPG|RLN|UG|RUN-LOG)/.test(name)) return 'PROCEDURE';
  return 'CONTEXT';
}

/**
 * SA4E-337 Bug #2: extract tags from the file path segments.
 * e.g. documents/SA4E-100/BRD.md → ['sa4e', 'sa4e-100']; F3 → ['feature', 'f3'].
 */
export function extractTagsFromPath(filePath: string): string[] {
  const tags = new Set<string>();
  const parts = filePath.replace(/\\/g, '/').split('/');
  for (const part of parts) {
    if (/^SA4E-\d+$/i.test(part)) {
      tags.add('sa4e');
      tags.add(part.toLowerCase());
    }
    if (/^F[0-9]+$/i.test(part)) {
      tags.add('feature');
      tags.add(part.toLowerCase());
    }
  }
  return [...tags];
}

/** SA4E-337 Bug #4: ingestable extensions — .md, .txt and .drawio (case-insensitive). */
export function isIngestableFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower.endsWith('.md') || lower.endsWith('.txt') || lower.endsWith('.drawio');
}

/**
 * Recursively collect ingestable files under tempBase (SA4E-99 single pass).
 * Returns absolute paths in filesystem traversal order.
 */
export function collectIngestFiles(tempBase: string): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (isIngestableFile(entry.name)) files.push(full);
    }
  };
  walk(tempBase);
  return files;
}

/**
 * Build the args for the mem_ingest_file tool handler.
 *
 * Includes the SA4E-337 fields (type/tags/content_base64/scope/file_path) AND the
 * trusted tenant scope keys. `withScopeContext()` prefers `_projectContext`, with
 * `__userId`/`__projectId` as the canonical fallback (same shape as stampScope() in
 * kb-api.ts and stampProjectScope() in tools.ts) — omitting ALL of them would reset
 * the dispatcher scope to undefined and persist project_id = NULL.
 */
export function buildIngestFileArgs(
  filePath: string,
  content: string,
  tenant: IngestTenant,
): Record<string, unknown> {
  return {
    file_path: filePath,
    content_base64: Buffer.from(content, 'utf-8').toString('base64'),
    type: inferTypeFromPath(filePath),
    scope: 'PROJECT',
    tags: extractTagsFromPath(filePath).join(','),
    _projectContext: { userId: tenant.userId, projectId: tenant.projectId },
    __userId: tenant.userId,
    __projectId: tenant.projectId,
  };
}

/**
 * Verify the mem_ingest_file handler result.
 *
 * The handler chain (withErrorHandling → withScopeContext → withResultFormat) never
 * throws: failures come back as `isError: true` or as string results such as
 * "Error: file not found" / {"status":"unconvertible","reason":"no-tool"} (TDD §3.2
 * failedFiles reason). Returns ok=false with a human-readable reason for those.
 */
export function summarizeIngestResult(result: ToolResult | null | undefined): { ok: boolean; reason: string } {
  const text = (result?.content ?? []).map((part) => part.text ?? '').join('');
  if (result?.isError) {
    return { ok: false, reason: text.replace(/^Error:\s*/, '').trim() || 'tool execution failed' };
  }
  const trimmed = text.trim();
  // No content at all → the handler produced nothing verifiable; fail closed.
  if (!trimmed) return { ok: false, reason: 'empty ingest result' };
  if (trimmed.startsWith('Error:')) {
    return { ok: false, reason: trimmed.replace(/^Error:\s*/, '').trim() };
  }
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as { status?: string; reason?: string };
      if (parsed.status && parsed.status !== 'ingested') {
        return { ok: false, reason: String(parsed.reason ?? parsed.status) };
      }
    } catch {
      // SA4E-337 F3: text LOOKED like JSON but is not — fail closed instead of
      // silently reporting ok:true. Per-file isolation guarantees the run continues.
      return { ok: false, reason: 'invalid JSON ingest result' };
    }
  }
  return { ok: true, reason: '' };
}

/** Read one file and run it through the handler; returns a failure reason or null on success. */
async function ingestOneFile(
  filePath: string,
  tempBase: string,
  handler: ToolHandler,
  tenant: IngestTenant,
  logger: Logger,
): Promise<string | null> {
  const relPath = path.relative(tempBase, filePath).replace(/\\/g, '/');
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const result = await handler(buildIngestFileArgs(filePath, content, tenant));
    const verdict = summarizeIngestResult(result);
    if (verdict.ok) return null;
    logger.warn({ file: relPath, reason: verdict.reason }, '[ingest-docs] Failed to ingest document');
    return verdict.reason;
  } catch (err: any) {
    const reason = err?.message || String(err);
    logger.warn({ err, file: relPath }, '[ingest-docs] Failed to ingest document');
    return reason;
  }
}

/**
 * Ingest every staged file sequentially through the mem_ingest_file handler.
 * One bad file never aborts the run (SA4E-99) — it is recorded in failedFiles.
 */
export async function ingestFilesFromTemp(
  files: string[],
  tempBase: string,
  handler: ToolHandler,
  tenant: IngestTenant,
  logger: Logger,
): Promise<IngestOutcome> {
  const outcome: IngestOutcome = { ingested: 0, errors: 0, total: files.length, failedFiles: [] };
  for (const filePath of files) {
    const reason = await ingestOneFile(filePath, tempBase, handler, tenant, logger);
    if (reason === null) outcome.ingested++;
    else {
      outcome.errors++;
      outcome.failedFiles.push({ file: path.relative(tempBase, filePath).replace(/\\/g, '/'), reason });
    }
  }
  return outcome;
}
