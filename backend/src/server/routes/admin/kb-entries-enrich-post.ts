/** POST /api/admin/kb/entries/:id/enrich handler — queue TAG/CODE enrichment (BR-18). */
import type { Context } from 'hono';
import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import type { AdminContext } from './context.js';
import { resolvePegaSymbolId } from './kb-entries-detail.js';

export async function handleEnrichEntry(c: Context, ctx: AdminContext): Promise<Response> {
  const user = await ctx.requireAuth(c);
  if (user instanceof Response) return user;
  const permCheck = await ctx.requirePermission(c, user.userId, 'KB_READ');
  if (permCheck instanceof Response) return permCheck;
  let entryId = c.req.param('id') as string;

  const { getDbAdapter } = await import('../../../admin/db/core.js');
  const indexAdapter = getDbAdapter();
  const projectId = ctx.getRequestProjectId(c);

  // SA4E-171: legacy "pega:FQN" graph node ids → resolve to Pega symbol, enrich via CODE_ENRICHMENT
  if (entryId.startsWith('pega:')) {
    const resolved = await resolvePegaSymbolId(ctx, entryId.replace('pega:', ''));
    if (!resolved) return c.json({ error: 'Pega rule not found' }, 404);
    entryId = `code:${resolved}`;
  }

  // Branch: KB entries (non-symbol) — enrich via TAG_ENRICHMENT flow
  if (entryId.startsWith('kb-entry:')) {
    return enrichKbEntry(c, indexAdapter, entryId);
  }

  // Branch: Code symbols — push a HIGH_PRIORITY task into the queue (SA4E-155).
  // The TaskWorker picks it up ahead of bulk backlog (priority DESC ordering) and
  // performs the LLM enrichment. The caller polls GET ../enrich/poll for the result.
  if (!entryId.startsWith('code:') && !entryId.startsWith('sym-')) {
    return c.json({ error: 'Unsupported entry type for on-demand enrichment' }, 400);
  }
  const symbolId = entryId.startsWith('code:') ? entryId.replace('code:', '') : entryId.replace('sym-', '');
  const numId = parseInt(symbolId, 10);
  if (isNaN(numId)) return c.json({ error: 'Invalid symbol ID' }, 400);
  return enrichCodeSymbol(c, ctx, indexAdapter, numId, projectId);
}

/** SA4E-337 R1: read `tags` too — it seeds payload.existing_tags for the LLM-up merge. */
async function enrichKbEntry(c: Context, indexAdapter: DatabaseAdapter, entryId: string): Promise<Response> {
  const numericId = parseInt(entryId.replace('kb-entry:', ''), 10);
  const entry = await indexAdapter.getAsync<{ id: number; content: string; summary: string | null; enrichment_status: string | null; structured_map: string | null; source: string | null; tags: string | null }>(
    'SELECT id, content, summary, enrichment_status, structured_map, source, tags FROM knowledge_entries WHERE id = ?', [numericId]);
  if (!entry) return c.json({ error: 'Entry not found' }, 404);
  if (entry.enrichment_status === 'done') {
    const map = entry.structured_map ? JSON.parse(entry.structured_map) : {};
    return c.json({ status: 'already_enriched', enrichment: { summary: map.summary || entry.summary, pseudoCode: null, llmTags: map.tags || null, status: 'COMPLETED' } });
  }
  try {
    const { PendingTaskRepository } = await import('../../../modules/memory/task-queue/PendingTaskRepository.js');
    const { TaskType, TaskPriority } = await import('../../../modules/memory/task-queue/models.js');
    const taskRepo = new PendingTaskRepository(indexAdapter);
    const taskId = await taskRepo.create({
      task_type: TaskType.TAG_ENRICHMENT,
      entry_id: entry.id,
      // SA4E-337 F1: include `source` so the LLM-down fallback can derive path tags.
      // SA4E-337 R1: pass the entry's CURRENT tags — the LLM-up merge in
      // TaskWorker.processTagEnrichment() unions existing_tags with appliedTags
      // before UPDATEing `tags`; '' would wipe path tags persisted at insert (F1).
      payload: { entry_id: entry.id, content: (entry.summary || entry.content || '').slice(0, 2000), existing_tags: entry.tags ?? '', source: entry.source ?? '', options: { threshold: 0.6, autoApply: true } },
      priority: TaskPriority.HIGH,
    });
    return c.json({ status: 'queued', task_id: taskId, message: 'High-priority enrichment task created. Poll /enrich/poll for status (15s timeout).' });
  } catch (err: any) {
    return c.json({ status: 'error', message: err.message }, 500);
  }
}

async function enrichCodeSymbol(c: Context, ctx: AdminContext, indexAdapter: DatabaseAdapter, numId: number, projectId: string): Promise<Response> {
  // Check if already enriched
  const sym = await indexAdapter.getAsync<{ enrichment_status: string | null; kind: string; name: string; file_id: number }>(
    'SELECT enrichment_status, kind, name, file_id FROM symbols WHERE id = ?', [numId],
  );
  if (!sym) return c.json({ error: 'Symbol not found' }, 404);
  if (sym.enrichment_status === 'COMPLETED') {
    return c.json({ status: 'already_enriched', message: 'Symbol already has enrichment data' });
  }

  // Get file path for the payload
  const fileRow = await indexAdapter.getAsync<{ relative_path: string }>(
    'SELECT relative_path FROM files WHERE id = ?', [sym.file_id],
  );
  const filePath = fileRow?.relative_path || '';

  try {
    const { PendingTaskRepository } = await import('../../../modules/memory/task-queue/PendingTaskRepository.js');
    const { TaskType, TaskPriority } = await import('../../../modules/memory/task-queue/models.js');
    const taskRepo = new PendingTaskRepository(indexAdapter);
    const taskId = await taskRepo.create({
      task_type: TaskType.CODE_ENRICHMENT,
      entry_id: numId,
      payload: {
        symbolId: numId,
        symbolName: sym.name,
        symbolKind: sym.kind,
        projectId: projectId,
        filePath: filePath,
        workspaceType: sym.kind.startsWith('pega_') ? 'pega' : 'standard',
      },
      project_id: projectId,
      priority: TaskPriority.HIGH,
    });
    return c.json({
      status: 'queued',
      task_id: taskId,
      message: 'High-priority enrichment task created. Poll /enrich/poll for status (15s timeout).',
    });
  } catch (err: any) {
    ctx.logger.warn({ symbolId: numId, err: err.message }, '[on-demand-enrich] Failed to enqueue task');
    return c.json({ status: 'error', message: err.message }, 500);
  }
}
