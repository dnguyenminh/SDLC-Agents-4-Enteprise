/**
 * KB entries routes — search, list, and detail for KB entries.
 * SA4E-50: All admin-db calls are awaited since they are now async.
 */

import { Hono } from 'hono';
import {
  getKbEntries, getKbEntryById,
  searchKbEntries, recordQueryLog,
} from '../../../admin/admin-db.js';
import type { AdminContext } from './context.js';

export function createKbEntriesRoutes(ctx: AdminContext): Hono {
  const app = new Hono();

  app.post('/api/admin/search', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = await ctx.requirePermission(c, user.userId, 'SEARCH_EXPLORE');
    if (permCheck instanceof Response) return permCheck;
    const maxResults = (permCheck.roleData as any)?.maxResults;
    const { query, debug } = await c.req.json();
    if (!query) return c.json({ results: [] });
    const startTime = Date.now();
    const realResults = await searchKbEntries(query, ctx.getRequestProjectId(c));
    if (realResults.items.length > 0) {
      const responseTimeMs = Date.now() - startTime;
      await recordQueryLog(query, responseTimeMs, realResults.items.length, user.userId);
      const resultLimit = (typeof maxResults === 'number' && maxResults > 0) ? Math.min(maxResults, 20) : 20;
      const results = realResults.items.slice(0, resultLimit).map((item: any) => ({
        id: item.id || item.entry_id || 'unknown',
        source: item.source || item.summary || 'unknown',
        content: (item.content || '').substring(0, 300),
        tier: item.tier || 'SHARED',
        score: item.score || 0.5,
        scores: item.scores || { similarity: +(item.score || 0.5).toFixed(3), keyword: 0, recency: 0, quality: 0 },
      }));
      return c.json({ results, debug: debug ? { queryTokens: query.split(/\s+/), totalCandidates: realResults.total, searchTimeMs: responseTimeMs } : undefined });
    }
    const mockResults = [
      { id: 'e1', source: 'project-structure', content: 'Code Intelligence indexes the project for semantic search and navigation...', tier: 'SHARED', score: 0.92, scores: { similarity: 0.85, keyword: 0.95, recency: 0.90, quality: 0.98 } },
      { id: 'e2', source: 'admin-portal', content: 'Admin portal provides web-based management of KB entries, users, and MCP servers...', tier: 'PROJECT', score: 0.87, scores: { similarity: 0.82, keyword: 0.88, recency: 0.85, quality: 0.93 } },
      { id: 'e3', source: 'mcp-integration', content: 'MCP servers are orchestrated through orchestration.json configuration...', tier: 'SHARED', score: 0.79, scores: { similarity: 0.75, keyword: 0.72, recency: 0.95, quality: 0.74 } },
    ];
    const filtered = mockResults.filter(r => r.source.toLowerCase().includes(query.toLowerCase()) || r.content.toLowerCase().includes(query.toLowerCase()));
    const responseTimeMs = Date.now() - startTime;
    let finalResults = filtered.length > 0 ? filtered : mockResults.slice(0, 2);
    if (typeof maxResults === 'number' && maxResults > 0) finalResults = finalResults.slice(0, maxResults);
    await recordQueryLog(query, responseTimeMs, finalResults.length, user.userId);
    return c.json({ results: finalResults, debug: debug ? { queryTokens: query.split(/\s+/), totalCandidates: 42, searchTimeMs: responseTimeMs } : undefined });
  });

  app.get('/api/admin/kb/entries', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = await ctx.requirePermission(c, user.userId, 'KB_READ');
    if (permCheck instanceof Response) return permCheck;
    const page = parseInt(c.req.query('page') || '1');
    const pageSize = parseInt(c.req.query('pageSize') || '20');
    const sortBy = c.req.query('sortBy') || 'created_at';
    const sortDir = (c.req.query('sortDir') || 'desc') as 'asc' | 'desc';
    const result = await getKbEntries(page, pageSize, sortBy, sortDir, ctx.getRequestProjectId(c));
    const allowedTiers = (permCheck.roleData as any)?.allowedTiers;
    let entries = result.items;
    if (Array.isArray(allowedTiers)) entries = entries.filter((e: any) => { const t = e.tier || e.scope || 'SHARED'; return allowedTiers.includes(t); });
    return c.json({ entries, total: Array.isArray(allowedTiers) ? entries.length : result.total, page, pageSize, totalPages: Math.ceil((Array.isArray(allowedTiers) ? entries.length : result.total) / pageSize) });
  });

  app.get('/api/admin/kb/entries/:id', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = await ctx.requirePermission(c, user.userId, 'KB_READ');
    if (permCheck instanceof Response) return permCheck;
    let entryId = c.req.param('id');

    // SA4E-171: legacy "pega:FQN" graph node ids → resolve to Pega symbol (code:{symbolId})
    if (entryId.startsWith('pega:')) {
      const resolved = await resolvePegaSymbolId(ctx, entryId.replace('pega:', ''));
      if (!resolved) return c.json({ error: 'Pega rule not found' }, 404);
      entryId = `code:${resolved}`;
    }

    if (entryId.startsWith('code:') || entryId.startsWith('sym-')) {
      const symbolId = entryId.startsWith('code:') ? entryId.replace('code:', '') : entryId.replace('sym-', '');
      const detail = await getCodeSymbolDetail(symbolId, ctx);
      if (detail) return c.json(detail);
      return c.json({ error: 'Code symbol not found' }, 404);
    }

    // Pega graph nodes: entry_id = "pega:FQN" → lookup KB entry by source = FQN
    if (entryId.startsWith('pega:')) {
      const fqn = entryId.replace('pega:', '');
      const { getDbAdapter } = await import('../../../admin/db/core.js');
      const adapter = getDbAdapter();
      const entry = await adapter.getAsync<any>(
        "SELECT * FROM knowledge_entries WHERE source = ? AND (type = 'PEGA_RULE' OR type = 'PEGA_DATA') LIMIT 1",
        [fqn],
      );
      if (!entry) return c.json({ error: 'Pega rule not found' }, 404);
      let ruleInfo = '';
      try {
        const ruleJson = JSON.parse(entry.content);
        const label = ruleJson.pyLabel || ruleJson.pyDescription || '';
        const description = ruleJson.pyDescription || ruleJson.pyDeleteMemo || ruleJson.pyMemo || '';
        const className = ruleJson.pyClassName || '';
        const ruleType = ruleJson.pxObjClass || '';
        const parts: string[] = [];
        if (label) parts.push(`**${label}**`);
        if (description) parts.push(`> ${description}`);
        parts.push(`| Field | Value |\n|---|---|\n| Class | ${className} |\n| Rule Type | ${ruleType} |`);
        const steps = ruleJson.steps || ruleJson.pySteps || [];
        if (Array.isArray(steps) && steps.length > 0) {
          parts.push('\n**Steps:**');
          steps.forEach((step: any, i: number) => {
            const method = step.pyStepsActivityName || step.pyMethod || step.pyStepType || '';
            const desc = step.pyStepsDescription || step.pxStepDefaultDescription || step.pyLabel || step.pyStepDescription || '';
            const params = step.pyMethodParameters || '';
            const when = step.pyWhenCondition || step.pyWhenRule || '';
            const num = step.pyStepNum || step.pyStepNumber || String(i + 1);
            const methodStr = method ? `**${method}**` : '';
            const paramStr = params ? ` → \`${params}\`` : '';
            const descStr = desc ? ` — ${desc}` : '';
            const whenStr = when ? ` [WHEN: ${when}]` : '';
            let callParams = '';
            if (step.pyStepsCallParams && typeof step.pyStepsCallParams === 'object') {
              const cp = Object.entries(step.pyStepsCallParams).filter(([k]) => k !== 'pyTempPlaceHolder');
              if (cp.length > 0) callParams = ` (${cp.map(([k, v]) => `${k}=${v}`).join(', ')})`;
            }
            if (method || desc) parts.push(`${num}. ${methodStr}${paramStr}${callParams}${descStr}${whenStr}`);
          });
        }
        const whens = ruleJson.pyConditions || ruleJson.pyDecisionExpressions || [];
        if (Array.isArray(whens) && whens.length > 0) {
          parts.push('\n**Conditions:**');
          whens.forEach((w: any) => {
            const expr = w.pyExpression || w.pyCondition || JSON.stringify(w);
            parts.push(`- ${expr}`);
          });
        }
        const props = ruleJson.pyPropertyModes || ruleJson.pyProperties || [];
        if (Array.isArray(props) && props.length > 0) {
          parts.push(`\n**Properties:** ${props.length} defined`);
          props.slice(0, 10).forEach((p: any) => {
            const name = p.pyPropertyName || p.pyName || p.pyPropertyMode || '';
            const type = p.pyPropertyType || p.pyType || '';
            if (name) parts.push(`- \`${name}\` (${type || 'Text'})`);
          });
          if (props.length > 10) parts.push(`- ... and ${props.length - 10} more`);
        }
        ruleInfo = parts.join('\n');
      } catch (err) { ruleInfo = entry.summary || fqn; }
      return c.json({
        id: entryId,
        title: fqn.split(':').pop() || fqn,
        content: ruleInfo,
        tier: entry.tier || 'SEMANTIC',
        type: entry.type || 'PEGA_RULE',
        source: fqn,
        tags: entry.tags ? entry.tags.split(',').map((t: string) => t.trim()) : [],
        links: [],
        createdAt: entry.created_at,
        updatedAt: entry.updated_at,
      });
    }

    const lookupId = entryId.startsWith('doc-')
      ? entryId.replace('doc-', '')
      : entryId.startsWith('kb-entry:')
      ? entryId.replace('kb-entry:', '')
      : entryId;
    const entry = await getKbEntryById(lookupId);
    if (!entry) return c.json({ error: 'Entry not found' }, 404);
    const allowedTiers = (permCheck.roleData as any)?.allowedTiers;
    if (Array.isArray(allowedTiers)) {
      const entryTier = entry.tier || entry.scope || 'SHARED';
      if (!allowedTiers.includes(entryTier)) return c.json({ error: 'Forbidden: entry tier not in allowedTiers' }, 403);
    }
    const tags = ctx.kbTags[entryId] || [];
    const links = ctx.kbLinks[entryId] || [];
    return c.json({
      id: entry.id || entry.entry_id || entryId,
      title: entry.title || entry.source || 'Untitled',
      content: entry.content || '',
      tier: entry.tier || entry.scope || 'SHARED',
      type: entry.content_type || entry.type || 'document',
      source: entry.source || '',
      tags, links,
      qualityScore: entry.quality_score || entry.score || null,
      createdAt: entry.created_at || null,
      updatedAt: entry.updated_at || null,
    });
  });

  /** On-demand enrichment: trigger LLM enrichment for a single unenriched entry. */
  app.post('/api/admin/kb/entries/:id/enrich', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = await ctx.requirePermission(c, user.userId, 'KB_READ');
    if (permCheck instanceof Response) return permCheck;
    let entryId = c.req.param('id');

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
      const numericId = parseInt(entryId.replace('kb-entry:', ''), 10);
      const entry = await indexAdapter.getAsync<{ id: number; content: string; summary: string | null; enrichment_status: string | null; structured_map: string | null }>(
        'SELECT id, content, summary, enrichment_status, structured_map FROM knowledge_entries WHERE id = ?', [numericId]);
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
          payload: { entry_id: entry.id, content: (entry.summary || entry.content || '').slice(0, 2000), existing_tags: '', options: { threshold: 0.6, autoApply: true } },
          priority: TaskPriority.HIGH,
        });
        return c.json({ status: 'queued', task_id: taskId, message: 'High-priority enrichment task created. Poll /enrich/poll for status (15s timeout).' });
      } catch (err: any) {
        return c.json({ status: 'error', message: err.message }, 500);
      }
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
      ctx.logger.warn({ symbolId, err: err.message }, '[on-demand-enrich] Failed to enqueue task');
      return c.json({ status: 'error', message: err.message }, 500);
    }
  });

  /**
   * SA4E-155: Poll the status of an on-demand enrichment task.
   * Caller (extension/webview) polls every 500ms up to 15s. Returns the latest task
   * status for the entry; when COMPLETED it includes the enrichment result.
   */
  app.get('/api/admin/kb/entries/:id/enrich/poll', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = await ctx.requirePermission(c, user.userId, 'KB_READ');
    if (permCheck instanceof Response) return permCheck;
    let entryId = c.req.param('id');

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
  });

  /** Save enrichment data from extension-side LLM (fallback path). */
  app.post('/api/admin/kb/entries/:id/enrich-save', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = await ctx.requirePermission(c, user.userId, 'KB_READ');
    if (permCheck instanceof Response) return permCheck;
    const entryId = c.req.param('id');

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
  });

  return app;
}

/** SA4E-171: Resolve a Pega rule FQN to its symbol id (rules live in symbols). */
async function resolvePegaSymbolId(ctx: AdminContext, fqn: string): Promise<string | null> {
  try {
    const { getDbAdapter } = await import('../../../admin/db/core.js');
    const adapter = getDbAdapter();
    // Exact match on the full 5-part signature first.
    let sym = await adapter.getAsync<{ id: number }>(
      `SELECT s.id FROM symbols s JOIN files f ON f.id = s.file_id
       WHERE s.signature = ? AND s.kind LIKE 'pega_%' LIMIT 1`,
      [fqn],
    );
    // Fallback: legacy 3-part FQN deep-links (type:class:name) — match by prefix.
    if (!sym && (fqn.match(/:/g) || []).length === 2) {
      sym = await adapter.getAsync<{ id: number }>(
        `SELECT s.id FROM symbols s JOIN files f ON f.id = s.file_id
         WHERE s.signature LIKE ? AND s.kind LIKE 'pega_%' LIMIT 1`,
        [`${fqn}:%`],
      );
    }
    return sym ? String(sym.id) : null;
  } catch {
    return null;
  }
}

/** Fetch code symbol detail via SymbolRepository for KB Graph node click. */
async function getCodeSymbolDetail(symbolId: string, ctx: AdminContext): Promise<Record<string, unknown> | null> {
  try {
    const detail = await ctx.db.symbol.getSymbolDetail(symbolId);
    if (!detail) return null;
    const lines = detail.startLine && detail.endLine ? `Lines ${detail.startLine}\u2013${detail.endLine}` : '';
    // SA4E-104: Fetch body/pseudo code from body_embeddings if available
    let bodyCode = '';
    try {
      const numId = parseInt(symbolId, 10);
      if (!isNaN(numId)) {
        const { getDbAdapter } = await import('../../../admin/db/core.js');
        const indexAdapter = getDbAdapter();
        const bodyRow = await indexAdapter.getAsync<{ embedding: Buffer | Uint8Array }>(
          'SELECT embedding FROM body_embeddings WHERE symbol_id = ? AND chunk_index = 0', [numId],
        );
        if (bodyRow && bodyRow.embedding) {
          bodyCode = Buffer.from(bodyRow.embedding).toString('utf-8');
        }
      }
    } catch (err) { ctx.logger.debug({ symbolId, err }, 'body_embeddings table may not exist — skipping body code'); }
    const isPega = Boolean(detail.language && detail.language.toLowerCase() === 'pega');
    const codeLabel = isPega ? '**Rule Content:**' : '**Code:**';
    const codeFence = isPega ? 'text' : (detail.language?.toLowerCase() || 'typescript');
    // For Pega, show the 5 identity fields (type, class, name, ruleset, version)
    // parsed from the signature instead of the raw FQN string. These 5 together
    // uniquely identify a Pega rule.
    // Trailing two spaces = markdown hard line break, so each identity field
    // renders on its own line (content is rendered via marked.parse()).
    const BR = '  ';
    const identityParts: string[] = [];
    if (isPega && detail.signature) {
      const { parseFqn } = await import('../../../modules/pega/pega-mapping.js');
      const f = parseFqn(detail.signature);
      const dash = (v: string) => (v && v !== '-' ? v : '(none)');
      identityParts.push(
        `**Rule Name:** ${detail.name}${BR}`,
        `**Rule Type:** ${f.pxObjClass}${BR}`,
        `**Rule Class:** ${f.pyClassName}${BR}`,
        `**RuleSet:** ${dash(f.ruleSet)}${BR}`,
        `**Version:** ${dash(f.version)}`,
      );
    } else if (detail.signature) {
      identityParts.push(`**Signature:** \`${detail.signature}\``);
    }
    const metaParts = [
      detail.docComment ? `**Doc:** ${detail.docComment}` : '',
      `**Kind:** ${detail.kind}`, `**File:** ${detail.relativePath}`,
      lines ? `**Location:** ${lines}` : '',
      detail.module ? `**Module:** ${detail.module}` : '',
      detail.visibility ? `**Visibility:** ${detail.visibility}` : '',
      detail.parentSymbol ? `**Parent:** ${detail.parentSymbol}` : '',
    ].filter(Boolean);
    const contentParts = [
      // Identity block (each field already ends with a hard break) as its own paragraph.
      identityParts.join('\n'),
      // Meta fields: blank line between each so markdown keeps them on separate lines.
      metaParts.join('\n\n'),
      bodyCode ? `${codeLabel}\n\`\`\`${codeFence}\n${bodyCode.substring(0, 2000)}\n\`\`\`` : '',
    ].filter(Boolean).join('\n\n');
    return {
      id: `code:${detail.id}`,
      title: `${detail.name} (${detail.kind})`,
      content: contentParts, tier: 'CODE', type: 'CODE_ENTITY',
      source: detail.relativePath || '',
      tags: [detail.kind, detail.language, detail.module].filter(Boolean),
      links: [], qualityScore: null, createdAt: null, updatedAt: null,
      enrichment: {
        summary: detail.summary || null,
        pseudoCode: detail.pseudoCode || null,
        llmTags: detail.llmTags ? JSON.parse(detail.llmTags) : null,
        status: detail.enrichmentStatus || null,
      },
    };
  } catch (err) {
    ctx.logger.warn({ symbolId, err }, 'Failed to fetch code symbol detail');
    return null;
  }
}
