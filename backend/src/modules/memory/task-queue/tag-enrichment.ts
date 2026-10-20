/**
 * Tag enrichment task handlers — extracted from TaskWorker.
 * SA4E-47 (LLM path) + SA4E-337 (fallback path) + SA4E-99 (summary propagation).
 */
import type { TagAnalysisResult } from '../llm/analyzer.js';
import type { ContextChainInput, StructuredMapData } from '../llm/types.js';
import { safeParseStructuredMap } from '../llm/types.js';
import type { PendingTask } from './models.js';
import type { TagEnrichmentDeps } from './worker-context.js';
import { buildStructuredMap } from './structured-map.js';
import { fallbackTagExtraction } from './fallback-tags.js';

/** NEW-03: Conditional structured_map update — only applies if entry still pending. */
async function updateEntryStructuredMapConditional(
  deps: TagEnrichmentDeps,
  entryId: number,
  result: TagAnalysisResult,
  context?: ContextChainInput | null,
): Promise<void> {
  const { engine, config, logger } = deps;
  try {
    const entry = await engine.findById(entryId);
    if (!entry) return;
    if ((entry as any).enrichment_status === 'done') return;
    const existing = safeParseStructuredMap(entry.structured_map);
    const structuredMap: StructuredMapData = buildStructuredMap(result, existing, context, config, deps.llmService);
    let jsonStr = JSON.stringify(structuredMap);
    if (jsonStr.length > (config.structuredMapMaxSize ?? 102400)) {
      structuredMap.business_rules = (structuredMap.business_rules || []).slice(0, 5);
      structuredMap.actors = (structuredMap.actors || []).slice(0, 3);
      jsonStr = JSON.stringify(structuredMap);
    }
    await engine.getAdapter().runAsync(
      `UPDATE knowledge_entries SET structured_map = ? WHERE id = ? AND enrichment_status = 'pending'`,
      [jsonStr, entryId],
    );
  } catch (err) {
    logger.warn({ entry_id: entryId, err, component: 'TaskWorker' },
      'structured_map conditional update failed');
  }
}

/** SA4E-99: Propagate LLM-generated summary to knowledge_entries.summary and graph_nodes.label. */
async function propagateSummary(deps: TagEnrichmentDeps, entryId: number, llmSummary: string): Promise<void> {
  const truncatedSummary = llmSummary.slice(0, 300);
  const graphLabel = llmSummary.slice(0, 60);
  try {
    await deps.engine.getAdapter().runAsync(
      `UPDATE knowledge_entries SET summary = ? WHERE id = ? AND enrichment_status = 'pending'`,
      [truncatedSummary, entryId],
    );
    await deps.engine.getAdapter().runAsync(
      `UPDATE graph_nodes SET label = ? WHERE entry_id = ?`,
      [graphLabel, `doc-${entryId}`],
    );
    deps.logger.debug({ entry_id: entryId, component: 'TaskWorker' },
      'LLM summary propagated to KB entry + graph node');
  } catch (err) {
    deps.logger.warn({ entry_id: entryId, err, component: 'TaskWorker' },
      'Summary propagation failed (non-fatal)');
  }
}

/** Load the previous section's context chain input for chained enrichment (SA4E-44). */
export async function loadPreviousContext(
  deps: TagEnrichmentDeps,
  entryId: number,
  source: string | null,
): Promise<ContextChainInput | null> {
  if (!source) return null;
  try {
    const prevEntry = await deps.engine.getAdapter().getAsync<{ id: number; structured_map: string | null }>(
      'SELECT id, structured_map FROM knowledge_entries WHERE source = ? AND id < ? ORDER BY id DESC LIMIT 1',
      [source, entryId],
    );
    if (!prevEntry) {
      deps.logger.debug({ entry_id: entryId, component: 'TaskWorker' },
        'No previous section found');
      return null;
    }
    const map = safeParseStructuredMap(prevEntry.structured_map);
    if (!map.summary && (!map.business_entities || map.business_entities.length === 0)) {
      deps.logger.debug({ entry_id: entryId, component: 'TaskWorker' },
        'Previous section has no extractable data');
      return null;
    }
    return {
      previous_section_id: prevEntry.id,
      summary: (map.summary || '').slice(0, deps.config.contextChainMaxLength),
      business_entities: (map.business_entities || []).slice(0, 5),
      actors: (map.actors || []).slice(0, 5),
      business_rules: (map.business_rules || []).slice(0, 10),
    };
  } catch (err) {
    deps.logger.warn({ entry_id: entryId, err, component: 'TaskWorker' },
      'Failed to load previous context');
    return null;
  }
}

// ── SA4E-47: Enhanced Tag Enrichment ──

export async function processTagEnrichmentTask(deps: TagEnrichmentDeps, task: PendingTask, payload: any): Promise<void> {
  // SA4E-337: Fallback tag extraction when LLM unavailable
  if (!deps.tagAnalyzer) {
    await fallbackTagExtraction(deps, task, payload);
    return;
  }

  // SA4E-79: Check if already enriched by client (BR-12, BR-13)
  const entry = await deps.engine.findById(task.entry_id);
  if (!entry) { await deps.repo.markFailed(task.id, 'entry_not_found'); return; }
  if ((entry as any).enrichment_status === 'done') {
    deps.logger.info({ entry_id: task.entry_id }, 'Skipping TAG_ENRICHMENT — already enriched');
    await deps.repo.markCompleted(task.id);
    return;
  }

  const context = deps.config.enableContextChain
    ? await deps.loadPreviousContext(task.entry_id, payload.source)
    : null;

  if (context) {
    deps.logger.debug({ entry_id: task.entry_id, prev_section_id: context.previous_section_id,
      component: 'TaskWorker' }, 'Context chain applied');
  }

  const result = await deps.tagAnalyzer.analyzeTags(payload.content, payload.options, context);

  // TA-08: Re-check status after LLM call — client may have enriched during processing
  const currentEntry = await deps.engine.findById(task.entry_id);
  if (!currentEntry || (currentEntry as any).enrichment_status === 'done') {
    deps.logger.info({ entry_id: task.entry_id }, 'Client enriched during LLM processing — discarding result');
    await deps.repo.markCompleted(task.id);
    return;
  }

  if (result.appliedTags.length > 0) {
    const existing = payload.existing_tags
      ? payload.existing_tags.split(',').map((t: string) => t.trim()).filter(Boolean)
      : [];
    const merged = [...new Set([...existing, ...result.appliedTags])];
    // NEW-03: Conditional update — only apply if still pending (race guard)
    await deps.engine.getAdapter().runAsync(
      `UPDATE knowledge_entries SET tags = ? WHERE id = ? AND enrichment_status = 'pending'`,
      [merged.join(','), task.entry_id],
    );
  }

  // NEW-03: Conditional structured_map update — only if still pending
  await updateEntryStructuredMapConditional(deps, task.entry_id, result, context);

  // SA4E-99: Propagate LLM summary to knowledge_entries.summary + graph_nodes.label
  if (result.summary && result.summary.length > 0) {
    await propagateSummary(deps, task.entry_id, result.summary);
  }

  // SA4E-79: Mark entry as enriched by backend LLM (atomic — changes=0 if client won)
  const now = new Date().toISOString();
  const updateResult = await deps.engine.getAdapter().runAsync(
    `UPDATE knowledge_entries
     SET enrichment_status = 'done', enriched_by = 'backend_llm', enriched_at = ?
     WHERE id = ? AND enrichment_status = 'pending'`,
    [now, task.entry_id],
  );

  if (updateResult.changes === 0) {
    deps.logger.info({ entry_id: task.entry_id }, 'Client enriched during tag/map update — discarding');
  }

  await deps.repo.markCompleted(task.id);
}

