/** mem_pin + mem_map handlers (BR-18 extraction from crud.ts). */
import type { MemoryEngine } from '../engine/core.js';

type Args = Record<string, unknown>;

export async function handlePin(a: Args, engine?: MemoryEngine): Promise<string> {
  const action = (a.action as string) || 'list';
  const id = a.entry_id as number;

  if (!engine) return 'Error: engine not available';

  switch (action) {
    case 'pin': {
      if (!id) return 'Error: entry_id required';
      const adapter = engine.getAdapter();
      const dialect = new (await import('../../../database/dialect/DialectHelper.js')).DialectHelper(adapter.getEngine());
      await adapter.runAsync(
        `UPDATE knowledge_entries SET pinned = 1, updated_at = ${dialect.now()} WHERE id = ?`,
        [id],
      );
      return `Pinned #${id}`;
    }
    case 'unpin': {
      if (!id) return 'Error: entry_id required';
      const adapter = engine.getAdapter();
      const dialect = new (await import('../../../database/dialect/DialectHelper.js')).DialectHelper(adapter.getEngine());
      await adapter.runAsync(
        `UPDATE knowledge_entries SET pinned = 0, updated_at = ${dialect.now()} WHERE id = ?`,
        [id],
      );
      return `Unpinned #${id}`;
    }
    case 'list': {
      const rows = await engine.getAdapter().allAsync<{ id: number; summary: string; pin_order: number }>(
        `SELECT id, summary, pin_order FROM knowledge_entries WHERE pinned = 1 AND archived = 0 ORDER BY pin_order ASC, id DESC LIMIT 50`,
        [],
      );
      const total = await engine.getAdapter().getAsync<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM knowledge_entries WHERE pinned = 1 AND archived = 0`, [],
      );
      return JSON.stringify({
        count: total?.cnt ?? rows.length,
        showing: rows.length,
        entries: rows.map(r => ({ id: r.id, summary: (r.summary || '').slice(0, 100), order: r.pin_order })),
      });
    }
    case 'get_context': {
      const rows = await engine.getAdapter().allAsync<{ id: number; summary: string; content: string; enrichment_status: string }>(
        `SELECT id, summary, content, enrichment_status FROM knowledge_entries WHERE pinned = 1 AND archived = 0 ORDER BY pin_order ASC, id DESC LIMIT 10`,
        [],
      );
      if (rows.length === 0) return '(no pinned entries)';
      const lines = rows.map(r => `[#${r.id}] ${(r.summary || '').slice(0, 80)}\n${(r.content || '').slice(0, 200)}`);
      // SA4E-79: Include pending pinned entries for client-side enrichment
      const pending = rows.filter(r => r.enrichment_status === 'pending');
      if (pending.length > 0) {
        lines.push('\n--- Pending Entries (need enrichment) ---\n');
        pending.slice(0, 3).forEach((pe, idx) => {
          lines.push(`[PENDING #${idx + 1}] ID: ${pe.id} | Source: pinned`);
          lines.push(`  Content: ${(pe.content || '').slice(0, 300)}`);
          lines.push('');
        });
      }
      return lines.join('\n\n');
    }
    case 'budget': {
      const row = await engine.getAdapter().getAsync<{ cnt: number; total_len: number }>(
        `SELECT COUNT(*) as cnt, COALESCE(SUM(LENGTH(content)), 0) as total_len FROM knowledge_entries WHERE pinned = 1 AND archived = 0`, [],
      );
      const totalTokens = Math.ceil((row?.total_len ?? 0) / 4);
      return JSON.stringify({ pinned_count: row?.cnt ?? 0, estimated_tokens: totalTokens, budget: 2000 });
    }
    default:
      return `Unknown pin action: ${action}`;
  }
}

export function handleMap(a: Args): string {
  const action = (a.action as string) || 'get';
  const id = a.entry_id as number;
  const MAP_ACTIONS: Record<string, () => string> = {
    get:    () => id ? '{}' : 'Error: entry_id required',
    update: () => id ? `Updated map for #${id}` : 'Error: entry_id required',
  };
  return (MAP_ACTIONS[action] ?? (() => `Unknown map action: ${action}`))();
}
