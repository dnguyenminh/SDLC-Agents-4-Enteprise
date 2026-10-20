/** On-demand enrichment route handlers (BR-18 extraction from kb-entries.ts). */
import type { Context } from 'hono';
import type { AdminContext } from './context.js';
import { resolvePegaSymbolId } from './kb-entries-detail.js';

/**
 * SA4E-155: Poll the status of an on-demand enrichment task.
 * Caller (extension/webview) polls every 500ms up to 15s. Returns the latest task
 * status for the entry; when COMPLETED it includes the enrichment result.
 */
export async function handleEnrichPoll(c: Context, ctx: AdminContext): Promise<Response> {
  const user = await ctx.requireAuth(c);
  if (user instanceof Response) return user;
  const permCheck = await ctx.requirePermission(c, user.userId, 'KB_READ');
  if (permCheck instanceof Response) return permCheck;
  let entryId = c.req.param('id') as string;

  const { getDbAdapter } = await import('../../../admin/db/core.js');
  const indexAdapter = getDbAdapter();

  // Resolve pega: → code: symbol id
  if (entryId.startsWith('pega:')) {
    const resolved = await resolvePegaSymbolId(ctx, entryId.replace('pega:', ''));
    if (!resolved) return c.json({ error: 'Pega rule not found' }, 404);
    entryId = `code:${resolved}`;
  }

  let taskType: string;
  let numericId: number;
  if (entryId.startsWith('kb-entry:')) {
    taskType = 'TAG_ENRICHMENT';
    numericId = parseInt(entryId.replace('kb-entry:', ''), 10);
  } else if (entryId.startsWith('code:') || entryId.startsWith('sym-')) {
    taskType = 'CODE_ENRICHMENT';
    numericId = parseInt(entryId.replace('code:', '').replace('sym-', ''), 10);
  } else {
    return c.json({ error: 'Unsupported entry type for enrichment poll' }, 400);
  }
  if (isNaN(numericId)) return c.json({ error: 'Invalid entry ID' }, 400);

  const { TaskStatus } = await import('../../../modules/memory/task-queue/models.js');
  const task = await indexAdapter.getAsync<{ id: number; status: string }>(
    `SELECT id, status FROM pending_tasks WHERE entry_id = ? AND task_type = ? ORDER BY id DESC LIMIT 1`,
    [numericId, taskType],
  );
  if (!task) return c.json({ status: 'not_found' });

  if (task.status === TaskStatus.COMPLETED) {
    if (taskType === 'CODE_ENRICHMENT') {
      const updated = await indexAdapter.getAsync<{ summary: string | null; pseudo_code: string | null; llm_tags: string | null }>(
        'SELECT summary, pseudo_code, llm_tags FROM symbols WHERE id = ?', [numericId],
      );
      return c.json({
        status: 'completed',
        task_id: task.id,
        enrichment: {
          summary: updated?.summary || null,
          pseudoCode: updated?.pseudo_code || null,
          llmTags: updated?.llm_tags ? JSON.parse(updated.llm_tags) : null,
          status: 'COMPLETED',
        },
      });
    }
    const entry = await indexAdapter.getAsync<{ enrichment_status: string | null; structured_map: string | null; summary: string | null }>(
      'SELECT enrichment_status, structured_map, summary FROM knowledge_entries WHERE id = ?', [numericId],
    );
    const map = entry?.structured_map ? JSON.parse(entry.structured_map) : {};
    return c.json({
      status: 'completed',
      task_id: task.id,
      enrichment: {
        summary: map.summary || entry?.summary || null,
        pseudoCode: null,
        llmTags: map.tags || null,
        status: 'COMPLETED',
      },
    });
  }

  if (task.status === TaskStatus.FAILED) {
    return c.json({ status: 'failed', task_id: task.id, message: 'Enrichment task failed. Extension fallback may be used.' }, 410);
  }

  return c.json({ status: task.status.toLowerCase(), task_id: task.id });
}

/** Save enrichment data from extension-side LLM (fallback path). */
export async function handleEnrichSave(c: Context, ctx: AdminContext): Promise<Response> {
  const user = await ctx.requireAuth(c);
  if (user instanceof Response) return user;
  const permCheck = await ctx.requirePermission(c, user.userId, 'KB_READ');
  if (permCheck instanceof Response) return permCheck;
  const entryId = c.req.param('id') as string;

  if (!entryId.startsWith('code:') && !entryId.startsWith('sym-')) {
    return c.json({ error: 'Only code symbols support enrichment save' }, 400);
  }
  const symbolId = entryId.startsWith('code:') ? entryId.replace('code:', '') : entryId.replace('sym-', '');
  const numId = parseInt(symbolId, 10);
  if (isNaN(numId)) return c.json({ error: 'Invalid symbol ID' }, 400);

  const { summary, pseudoCode } = await c.req.json();
  if (!summary && !pseudoCode) return c.json({ error: 'At least summary or pseudoCode required' }, 400);

  const { getDbAdapter } = await import('../../../admin/db/core.js');
  const indexAdapter = getDbAdapter();
  const now = new Date().toISOString();
  await indexAdapter.runAsync(
    `UPDATE symbols SET summary = COALESCE(?, summary), pseudo_code = COALESCE(?, pseudo_code),
     enrichment_status = 'COMPLETED', enriched_at = ? WHERE id = ?`,
    [summary || null, pseudoCode || null, now, numId],
  );
  return c.json({ status: 'saved' });
}
