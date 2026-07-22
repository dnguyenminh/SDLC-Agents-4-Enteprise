/**
 * Smart Ingest Handler — orchestrates LLM classification + KB ingestion.
 * Implements mem_smart_ingest and mem_smart_ingest_cleanup tools.
 * Never throws — always returns valid JSON response.
 */

import type { MemoryEngine } from '../engine/core.js';
import type { ScopeContext, KnowledgeEntry } from '../models.js';
import type { ClassifyService, ClassifyResult } from '../llm/classify-service.js';

type Args = Record<string, unknown>;

export interface SmartIngestResult {
  action: 'ingest' | 'skip' | 'ingest_unfiltered' | 'error';
  summary?: string;
  reason?: string;
}

export interface CleanupResult {
  processed: number;
  ingested: number;
  deleted: number;
  remaining: number;
  dry_run: boolean;
  reason?: string;
}

const MAX_MESSAGE_LENGTH = 10000;
const MAX_SUMMARY_LENGTH = 200;
const MAX_FALLBACK_LENGTH = 500;
const MAX_BATCH_SIZE = 100;
const DEFAULT_BATCH_SIZE = 50;

// ─── Validation ─────────────────────────────────────────────────────

function validateMessage(message: unknown): SmartIngestResult | null {
  if (!message || typeof message !== 'string') {
    return { action: 'skip', reason: 'empty_message' };
  }
  const trimmed = message.trim();
  if (trimmed.length === 0) {
    return { action: 'skip', reason: 'empty_message' };
  }
  return null;
}

function truncateMessage(message: string): string {
  return message.trim().slice(0, MAX_MESSAGE_LENGTH);
}

// ─── Duplicate Detection ────────────────────────────────────────────

async function isDuplicate(engine: MemoryEngine, content: string): Promise<boolean> {
  const hash = content.slice(0, 500);
  const rows = await engine.getAdapter().allAsync<{ id: number }>(
    `SELECT id FROM knowledge_entries WHERE content = ? AND source = '/chat-prompt' LIMIT 1`,
    [hash],
  );
  return rows.length > 0;
}

// ─── Ingest Helpers ─────────────────────────────────────────────────

async function ingestWithSummary(
  engine: MemoryEngine, scopeCtx: ScopeContext | undefined, summary: string,
): Promise<number> {
  return await engine.insert({
    content: summary.slice(0, MAX_SUMMARY_LENGTH),
    summary: summary.slice(0, MAX_SUMMARY_LENGTH),
    type: 'CONTEXT',
    tier: 'T1',
    scope: 'USER',
    user_id: scopeCtx?.userId ?? null,
    project_id: scopeCtx?.projectId ?? null,
    source: '/chat-prompt',
    tags: 'chat,stream,user,smart-ingest',
  });
}

async function ingestUnfiltered(
  engine: MemoryEngine, scopeCtx: ScopeContext | undefined, message: string,
): Promise<number> {
  return await engine.insert({
    content: message.slice(0, MAX_FALLBACK_LENGTH),
    summary: message.slice(0, 120),
    type: 'CONTEXT',
    tier: 'T1',
    scope: 'USER',
    user_id: scopeCtx?.userId ?? null,
    project_id: scopeCtx?.projectId ?? null,
    source: '/chat-prompt',
    tags: 'chat,stream,user,unfiltered',
  });
}

// ─── Cleanup Helpers ────────────────────────────────────────────────

async function processCleanupEntry(
  engine: MemoryEngine,
  classifyService: ClassifyService,
  entry: KnowledgeEntry,
  dryRun: boolean,
): Promise<'ingested' | 'deleted'> {
  const result: ClassifyResult = await classifyService.classify(entry.content);

  if (result.verdict === 'ingest') {
    if (!dryRun) {
      const newTags = entry.tags.replace(/\bunfiltered\b/, 'smart-ingest').replace(/,,/g, ',');
      const summary = result.summary || entry.content.slice(0, MAX_SUMMARY_LENGTH);
      const dialect = engine.getDialect();
      await engine.getAdapter().runAsync(
        `UPDATE knowledge_entries SET content = ?, summary = ?, tags = ?, updated_at = ${dialect.now()} WHERE id = ?`,
        [summary, summary, newTags.replace(/^,|,$/g, ''), entry.id],
      );
    }
    return 'ingested';
  }

  if (!dryRun) {
    await engine.deleteEntry(entry.id);
    await engine.auditLog('SMART_CLEANUP_DELETE', entry.id);
  }
  return 'deleted';
}

// ─── Main Handlers ──────────────────────────────────────────────────

export async function handleSmartIngest(
  engine: MemoryEngine,
  scopeCtx: ScopeContext | undefined,
  classifyService: ClassifyService | undefined,
  args: Args,
): Promise<string> {
  try {
    const validation = validateMessage(args.message);
    if (validation) return JSON.stringify(validation);

    const message = truncateMessage(args.message as string);

    if (!classifyService || !(await classifyService.isAvailable())) {
      await ingestUnfiltered(engine, scopeCtx, message);
      return JSON.stringify({ action: 'ingest_unfiltered', reason: 'llm_unavailable' });
    }

    let result: ClassifyResult;
    try {
      result = await classifyService.classify(message);
    } catch {
      await ingestUnfiltered(engine, scopeCtx, message);
      return JSON.stringify({ action: 'ingest_unfiltered', reason: 'llm_parse_error' });
    }

    if (result.verdict === 'skip') {
      return JSON.stringify({ action: 'skip', reason: 'no business/technical value' });
    }

    const summary = result.summary || message.slice(0, MAX_SUMMARY_LENGTH);
    if (await isDuplicate(engine, summary)) {
      return JSON.stringify({ action: 'skip', reason: 'duplicate' });
    }

    await ingestWithSummary(engine, scopeCtx, summary);
    return JSON.stringify({ action: 'ingest', summary });
  } catch {
    return JSON.stringify({ action: 'error', reason: 'ingest_failed' });
  }
}

export async function handleSmartIngestCleanup(
  engine: MemoryEngine,
  scopeCtx: ScopeContext | undefined,
  classifyService: ClassifyService | undefined,
  args: Args,
): Promise<string> {
  try {
    if (!classifyService || !(await classifyService.isAvailable())) {
      return JSON.stringify({ processed: 0, reason: 'llm_unavailable' });
    }

    const batchSize = Math.min(MAX_BATCH_SIZE, Math.max(1, Number(args.batch_size) || DEFAULT_BATCH_SIZE));
    const dryRun = Boolean(args.dry_run);

    const entries = await engine.getAdapter().allAsync<KnowledgeEntry>(
      `SELECT * FROM knowledge_entries WHERE tags LIKE '%unfiltered%' ORDER BY created_at ASC LIMIT ?`,
      [batchSize],
    );

    let ingested = 0;
    let deleted = 0;
    let processed = 0;

    for (const entry of entries) {
      try {
        const outcome = await processCleanupEntry(engine, classifyService, entry, dryRun);
        outcome === 'ingested' ? ingested++ : deleted++;
        processed++;
      } catch {
        // LLM failed mid-batch — stop processing
        const remaining = await countUnfiltered(engine);
        return JSON.stringify({
          processed, ingested, deleted, remaining,
          dry_run: dryRun, reason: 'llm_unavailable_mid_batch',
        } satisfies CleanupResult);
      }
    }

    const remaining = await countUnfiltered(engine);
    return JSON.stringify({
      processed, ingested, deleted, remaining, dry_run: dryRun,
    } satisfies CleanupResult);
  } catch {
    return JSON.stringify({ processed: 0, reason: 'cleanup_failed' });
  }
}

async function countUnfiltered(engine: MemoryEngine): Promise<number> {
  const row = await engine.getAdapter().getAsync<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM knowledge_entries WHERE tags LIKE '%unfiltered%'`,
  );
  return row?.cnt ?? 0;
}


